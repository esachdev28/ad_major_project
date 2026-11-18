import React, { useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { CanvasTexture } from 'three';
import { getServiceHealth, SERVICE_HEALTH_STATES } from '../utils/serviceHealth';
import './DependencyGraph3D.css';

function getNodePositions(nodes) {
  if (nodes.length === 0) return new Map();

  const minX = Math.min(...nodes.map((node) => node.x));
  const maxX = Math.max(...nodes.map((node) => node.x + node.w));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxY = Math.max(...nodes.map((node) => node.y + node.h));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return new Map(nodes.map((node, index) => [
    node.id,
    [
      (node.x + node.w / 2 - centerX) * 0.012,
      -(node.y + node.h / 2 - centerY) * 0.012,
      Math.sin(index * 1.7) * 0.65,
    ],
  ]));
}

function ServiceLabel({ name, health }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    context.fillStyle = '#f8fafc';
    context.font = '600 32px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(name, canvas.width / 2, 43, canvas.width - 24);
    context.fillStyle = SERVICE_HEALTH_STATES[health].color;
    context.beginPath();
    context.arc(198, 94, 8, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#cbd5e1';
    context.font = '600 23px Arial, sans-serif';
    context.fillText(SERVICE_HEALTH_STATES[health].label.toUpperCase(), 270, 94);
    return new CanvasTexture(canvas);
  }, [health, name]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <sprite position={[0, 0.58, 0]} scale={[2.6, 0.65, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  );
}

function ServiceNode({ node, position }) {
  const health = getServiceHealth(node);

  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.22, 24, 24]} />
        <meshStandardMaterial color={SERVICE_HEALTH_STATES[health].color} roughness={0.38} metalness={0.15} />
      </mesh>
      <ServiceLabel name={node.name} health={health} />
    </group>
  );
}

function DependencyEdge({ edge, positions }) {
  const start = positions.get(edge.providerId);
  const end = positions.get(edge.consumerId);

  if (!start || !end) return null;

  const linePositions = new Float32Array([...start, ...end]);

  return (
    <line>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#64748b" transparent opacity={0.8} />
    </line>
  );
}

function FitGraphCamera({ positions }) {
  const { camera, size } = useThree();

  useEffect(() => {
    const points = Array.from(positions.values());
    const halfWidth = Math.max(...points.map(([x]) => Math.abs(x)), 1);
    const halfHeight = Math.max(...points.map(([, y]) => Math.abs(y)), 1);
    const verticalHalfFov = (42 * Math.PI) / 360;
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * (size.width / size.height));
    const distance = Math.max(
      halfHeight / Math.tan(verticalHalfFov),
      halfWidth / Math.tan(horizontalHalfFov),
      7
    ) * 1.25;

    camera.position.set(0, 1.2, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, positions, size.height, size.width]);

  return null;
}

/**
 * Renders the existing dependency graph layout in a Three.js scene.
 * Node positions come from the 2D graph layout, so the service topology
 * is not calculated a second time for this view.
 */
export default function DependencyGraph3D({ nodes, edges }) {
  const positions = useMemo(() => getNodePositions(nodes), [nodes]);
  return (
    <div className="dependency-3d-container" aria-label="Three-dimensional service dependency graph">
      <Canvas
        camera={{ position: [0, 1.2, 9], fov: 42 }}
        dpr={[1, 1.5]}
        fallback={<p className="dependency-3d-fallback">3D rendering is unavailable in this browser.</p>}
      >
        <color attach="background" args={['#101623']} />
        <ambientLight intensity={1.2} />
        <directionalLight position={[4, 6, 8]} intensity={2} />
        <FitGraphCamera positions={positions} />

        {edges.map((edge) => (
          <DependencyEdge key={edge.id} edge={edge} positions={positions} />
        ))}
        {nodes.map((node) => (
          <ServiceNode key={node.id} node={node} position={positions.get(node.id)} />
        ))}
      </Canvas>
      <div className="dependency-3d-health-legend" aria-label="Service health legend">
        {Object.entries(SERVICE_HEALTH_STATES).map(([state, health]) => (
          <span key={state}>
            <i style={{ backgroundColor: health.color }} aria-hidden="true" />
            {health.label}
          </span>
        ))}
      </div>
      <p className="dependency-3d-caption">
        Node colors use the latest monitoring check and active incident data. Services without a check are not monitored.
      </p>
    </div>
  );
}
