import React, { useEffect, useMemo, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { createXRStore, IfInSessionMode, useXR, XR } from '@react-three/xr';
import { CanvasTexture } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getServiceHealth, SERVICE_HEALTH_STATES } from '../utils/serviceHealth';
import { checkWebXRSupport } from '../utils/webXRSupport';
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

function ServiceNode({ node, position, isSelected, onSelect }) {
  const health = getServiceHealth(node);
  const { gl } = useThree();

  return (
    <group position={position}>
      <mesh
        scale={isSelected ? 1.4 : 1}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(node.id);
        }}
        onPointerOver={() => { gl.domElement.style.cursor = 'pointer'; }}
        onPointerOut={() => { gl.domElement.style.cursor = ''; }}
      >
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
  const linePositions = useMemo(
    () => (start && end ? new Float32Array([...start, ...end]) : null),
    [end, start]
  );

  if (!linePositions) return null;

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

function GraphControls() {
  const { camera, gl } = useThree();
  const controls = useMemo(() => new OrbitControls(camera, gl.domElement), [camera, gl]);

  useEffect(() => {
    controls.enableDamping = true;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.minDistance = 3;
    controls.maxDistance = 80;
    controls.update();

    return () => controls.dispose();
  }, [controls]);

  useFrame(() => controls.update());

  return null;
}

function DependencyScene({ nodes, edges, positions, selectedServiceId, onSelectService }) {
  const isInVR = useXR((state) => state.session?.mode === 'immersive-vr');
  const halfWidth = Math.max(...Array.from(positions.values()).map(([x]) => Math.abs(x)), 1);
  const vrScale = Math.min(1, 6 / halfWidth);

  return (
    <>
      <IfInSessionMode deny="immersive-vr">
        <FitGraphCamera positions={positions} />
        <GraphControls />
      </IfInSessionMode>
      <group
        position={isInVR ? [0, 1.5, -4] : [0, 0, 0]}
        scale={isInVR ? vrScale : 1}
      >
        {edges.map((edge) => (
          <DependencyEdge key={edge.id} edge={edge} positions={positions} />
        ))}
        {nodes.map((node) => (
          <ServiceNode
            key={node.id}
            node={node}
            position={positions.get(node.id)}
            isSelected={node.id === selectedServiceId}
            onSelect={onSelectService}
          />
        ))}
      </group>
    </>
  );
}

function ServiceDetails({ service, nodes, edges, onSelect }) {
  if (!service) {
    return <p className="dependency-3d-details-empty">Select a service node to inspect its details.</p>;
  }

  const health = getServiceHealth(service);
  const latestCheck = service.endpoint?.healthChecks?.[0];
  const incidents = service.endpoint?.incidents || [];
  const serviceNames = new Map(nodes.map((node) => [node.id, node.name]));
  const dependencies = edges
    .filter((edge) => edge.consumerId === service.id)
    .map((edge) => edge.provider?.name || serviceNames.get(edge.providerId))
    .filter(Boolean);
  const consumers = edges
    .filter((edge) => edge.providerId === service.id)
    .map((edge) => edge.consumer?.name || serviceNames.get(edge.consumerId))
    .filter(Boolean);

  return (
    <section className="dependency-3d-service-details" aria-live="polite">
      <div className="dependency-3d-details-heading">
        <div>
          <p className="dependency-3d-details-eyebrow">Selected service</p>
          <h4>{service.name}</h4>
        </div>
        <span className={`dependency-3d-status dependency-3d-status-${health.toLowerCase()}`}>
          {SERVICE_HEALTH_STATES[health].label}
        </span>
      </div>

      <label className="dependency-3d-service-picker">
        Inspect another service
        <select value={service.id} onChange={(event) => onSelect(event.target.value)}>
          {nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
        </select>
      </label>

      <div className="dependency-3d-details-grid">
        <div>
          <span>Criticality</span>
          <strong>{service.criticality || 'Not set'}</strong>
        </div>
        <div>
          <span>Owner team</span>
          <strong>{service.ownerTeam || 'Not assigned'}</strong>
        </div>
        <div className="dependency-3d-detail-wide">
          <span>Linked endpoint</span>
          {service.endpoint ? (
            <code>{service.endpoint.method} {service.endpoint.url}</code>
          ) : (
            <strong>No endpoint linked</strong>
          )}
        </div>
        <div className="dependency-3d-detail-wide">
          <span>Latest monitoring check</span>
          {latestCheck ? (
            <strong>
              {latestCheck.isHealthy ? 'Healthy' : 'Failed'}
              {latestCheck.statusCode ? ` · HTTP ${latestCheck.statusCode}` : ''}
              {typeof latestCheck.latency === 'number' ? ` · ${latestCheck.latency} ms` : ''}
            </strong>
          ) : (
            <strong>No check recorded</strong>
          )}
        </div>
        <div>
          <span>Depends on</span>
          <strong>{dependencies.length ? dependencies.join(', ') : 'No providers registered'}</strong>
        </div>
        <div>
          <span>Consumers</span>
          <strong>{consumers.length ? consumers.join(', ') : 'No consumers registered'}</strong>
        </div>
        <div className="dependency-3d-detail-wide">
          <span>Active incidents</span>
          <strong>
            {incidents.length
              ? incidents.map((incident) => `${incident.title} (${incident.severity})`).join(', ')
              : 'None'}
          </strong>
        </div>
      </div>
    </section>
  );
}

/**
 * Renders the existing dependency graph layout in a Three.js scene.
 * Node positions come from the 2D graph layout, so the service topology
 * is not calculated a second time for this view.
 */
export default function DependencyGraph3D({ nodes, edges, selectedServiceId, onSelectService }) {
  const positions = useMemo(() => getNodePositions(nodes), [nodes]);
  const selectedService = nodes.find((node) => node.id === selectedServiceId);
  const xrStore = useMemo(() => createXRStore({ offerSession: false, emulate: false }), []);
  const [xrSupport, setXrSupport] = useState('checking');
  const [isStartingVr, setIsStartingVr] = useState(false);
  const [isVrActive, setIsVrActive] = useState(false);
  const [vrError, setVrError] = useState('');

  useEffect(() => {
    let isCancelled = false;

    async function checkVrSupport() {
      const support = await checkWebXRSupport(window.isSecureContext, navigator.xr);
      if (!isCancelled) setXrSupport(support);
    }

    checkVrSupport();
    return () => { isCancelled = true; };
  }, []);

  useEffect(() => xrStore.subscribe((state) => {
    setIsVrActive(state.session?.mode === 'immersive-vr');
  }), [xrStore]);

  const handleEnterVr = async () => {
    if (isVrActive) {
      try {
        await xrStore.getState().session?.end();
      } catch (_) {
        setVrError('The VR session could not be closed. Use the headset browser controls to exit it.');
      }
      return;
    }

    setIsStartingVr(true);
    setVrError('');
    try {
      const session = await xrStore.enterVR();
      if (!session) {
        setVrError('The browser could not start a VR session. Check the headset connection and browser permissions, or continue in 3D mode.');
      }
    } catch (_) {
      setVrError('The browser could not start a VR session. Check the headset connection and browser permissions, or continue in 3D mode.');
    } finally {
      setIsStartingVr(false);
    }
  };

  return (
    <div className="dependency-3d-container">
      <div className="dependency-3d-vr-bar">
        <div>
          <strong>Virtual reality</strong>
          <p role="status">
            {xrSupport === 'checking' && 'Checking whether this browser supports immersive VR…'}
            {xrSupport === 'supported' && 'This secure browser reports immersive VR support.'}
            {xrSupport === 'unsupported' && 'Immersive VR is unavailable here. The standard 3D view remains available.'}
            {xrSupport === 'insecure' && 'VR requires HTTPS on a network device; localhost is also a secure context.'}
          </p>
        </div>
        {xrSupport === 'supported' && (
          <button type="button" onClick={handleEnterVr} disabled={isStartingVr}>
            {isStartingVr ? 'Starting VR…' : isVrActive ? 'Exit VR' : 'Enter VR'}
          </button>
        )}
      </div>
      {vrError && <p className="dependency-3d-vr-error" role="alert">{vrError}</p>}
      <div className="dependency-3d-canvas-shell" role="region" aria-label="Three-dimensional service dependency graph">
        <Canvas
          camera={{ position: [0, 1.2, 9], fov: 42 }}
          dpr={[1, 1.5]}
          onPointerMissed={() => onSelectService('')}
          fallback={<p className="dependency-3d-fallback">3D rendering is unavailable in this browser.</p>}
        >
          <color attach="background" args={['#101623']} />
          <ambientLight intensity={1.2} />
          <directionalLight position={[4, 6, 8]} intensity={2} />
          <XR store={xrStore}>
            <DependencyScene
              nodes={nodes}
              edges={edges}
              positions={positions}
              selectedServiceId={selectedServiceId}
              onSelectService={onSelectService}
            />
          </XR>
        </Canvas>
      </div>
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
      <ServiceDetails
        service={selectedService}
        nodes={nodes}
        edges={edges}
        onSelect={onSelectService}
      />
      <p className="dependency-3d-controls-hint">
        Drag to rotate · Scroll or pinch to zoom · Right-drag or two-finger drag to move · Tap or click a node to inspect it
      </p>
    </div>
  );
}
