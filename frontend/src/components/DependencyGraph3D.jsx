import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { createXRStore, IfInSessionMode, useXR, XR } from '@react-three/xr';
import { CanvasTexture } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getServiceHealth, SERVICE_HEALTH_STATES } from '../utils/serviceHealth';
import { checkWebXRSupport } from '../utils/webXRSupport';
import { getIncidents } from '../services/api';
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

function drawWrappedText(context, value, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(value || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  let wasTruncated = false;

  for (let index = 0; index < words.length; index += 1) {
    const candidate = line ? `${line} ${words[index]}` : words[index];
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = words[index];
      if (lines.length === maxLines) {
        wasTruncated = true;
        break;
      }
    } else {
      line = candidate;
    }
  }

  if (line && lines.length < maxLines) lines.push(line);
  else if (line) wasTruncated = true;

  if (wasTruncated && lines.length > 0) lines[lines.length - 1] += '…';
  lines.forEach((text, index) => context.fillText(text, x, y + index * lineHeight, maxWidth));
  return y + lines.length * lineHeight;
}

function createAssistantTexture(report) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1280;
  const context = canvas.getContext('2d');

  context.fillStyle = '#101827';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#64748b';
  context.lineWidth = 5;
  context.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

  const left = 56;
  const maxWidth = canvas.width - 112;
  let y = 78;
  context.fillStyle = '#f8fafc';
  context.font = '700 38px Arial, sans-serif';
  context.fillText(
    report.provider === 'nvidia-nim' ? 'NVIDIA NIM EXPLANATION' : 'EVIDENCE-BASED FALLBACK',
    left,
    y
  );
  y += 42;
  context.fillStyle = '#94a3b8';
  context.font = '24px Arial, sans-serif';
  context.fillText(`${report.provider || 'Diagnostics'} · ${report.model || 'Report'}`, left, y);

  const drawSectionTitle = (title, color) => {
    y += 54;
    context.fillStyle = color;
    context.font = '700 28px Arial, sans-serif';
    context.fillText(title, left, y);
    y += 40;
    context.fillStyle = '#e2e8f0';
    context.font = '25px Arial, sans-serif';
  };

  drawSectionTitle('Summary', '#93c5fd');
  y = drawWrappedText(context, report.summary, left, y, maxWidth, 32, 3);

  const drawList = (title, items, color) => {
    drawSectionTitle(title, color);
    const visibleItems = (items || []).slice(0, 2);
    if (visibleItems.length === 0) {
      y = drawWrappedText(context, 'No details recorded.', left, y, maxWidth, 32, 1);
      return;
    }

    visibleItems.forEach((item) => {
      context.fillStyle = color;
      context.fillText('•', left, y);
      context.fillStyle = '#e2e8f0';
      y = drawWrappedText(context, item, left + 28, y, maxWidth - 28, 32, 2) + 10;
    });
    if ((items || []).length > visibleItems.length) {
      context.fillStyle = '#94a3b8';
      context.font = '22px Arial, sans-serif';
      context.fillText('More details are available in the accessible report below.', left, y);
    }
  };

  drawList('Verified facts', report.verifiedFacts, '#34d399');
  drawList('Possible causes (unconfirmed)', report.hypotheses, '#fbbf24');
  drawList('Suggested next steps', report.recommendations, '#93c5fd');
  return new CanvasTexture(canvas);
}

function VRIncidentAssistantPanel({ report, position }) {
  const texture = useMemo(() => createAssistantTexture(report), [report]);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh position={position}>
      <planeGeometry args={[3.8, 4.75]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
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

function DependencyScene({ nodes, edges, positions, selectedServiceId, onSelectService, aiReport }) {
  const isInVR = useXR((state) => state.session?.mode === 'immersive-vr');
  const halfWidth = Math.max(...Array.from(positions.values()).map(([x]) => Math.abs(x)), 1);
  const vrScale = Math.min(1, (aiReport ? 3.2 : 6) / halfWidth);

  return (
    <>
      <IfInSessionMode deny="immersive-vr">
        <FitGraphCamera positions={positions} />
        <GraphControls />
      </IfInSessionMode>
      <group
        position={isInVR ? (aiReport ? [-3.4, 1.5, -4] : [0, 1.5, -4]) : [0, 0, 0]}
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
      {isInVR && aiReport && (
        <VRIncidentAssistantPanel report={aiReport} position={[2.5, 2, -4]} />
      )}
    </>
  );
}

function ServiceDetails({ service, nodes, edges, onSelect, onRequestInvestigation }) {
  const [incidents, setIncidents] = useState([]);
  const [isLoadingIncidents, setIsLoadingIncidents] = useState(false);
  const [incidentError, setIncidentError] = useState('');

  const loadIncidents = useCallback(async (endpointId = service?.endpoint?.id, isCurrent = () => true) => {
    if (!endpointId) {
      setIncidents([]);
      setIncidentError('');
      setIsLoadingIncidents(false);
      return;
    }

    setIsLoadingIncidents(true);
    setIncidents([]);
    setIncidentError('');
    try {
      const result = await getIncidents({ endpointId });
      if (isCurrent()) {
        if (result.success) setIncidents(result.data || []);
        else setIncidentError(result.message || 'Unable to load incidents for this service.');
      }
    } catch (error) {
      if (isCurrent()) {
        setIncidents([]);
        setIncidentError(error.message || 'Unable to load incidents for this service.');
      }
    } finally {
      if (isCurrent()) setIsLoadingIncidents(false);
    }
  }, [service?.endpoint?.id]);

  useEffect(() => {
    let isCurrentService = true;

    async function fetchServiceIncidents() {
      await loadIncidents(service?.endpoint?.id, () => isCurrentService);
    }

    fetchServiceIncidents();
    return () => { isCurrentService = false; };
  }, [service?.endpoint?.id, loadIncidents]);

  if (!service) {
    return <p className="dependency-3d-details-empty">Select a service node to inspect its details.</p>;
  }

  const health = getServiceHealth(service);
  const latestCheck = service.endpoint?.healthChecks?.[0];
  const activeIncidents = incidents.filter((incident) => incident.status !== 'RESOLVED');
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
      </div>

      <div className="dependency-3d-incidents" aria-live="polite">
        <h5>Related incidents</h5>
        {isLoadingIncidents ? (
          <p>Loading incidents for this service…</p>
        ) : incidentError ? (
          <div role="alert">
            <p>{incidentError}</p>
            <button type="button" onClick={loadIncidents}>Try again</button>
          </div>
        ) : activeIncidents.length === 0 ? (
          <p>{incidents.length ? 'No active incidents. Resolved incidents are listed below.' : 'No incidents recorded for this service.'}</p>
        ) : (
          <ul>
            {activeIncidents.map((incident) => (
              <li key={incident.id}>
                <div className="dependency-3d-incident-heading">
                  <strong>{incident.title}</strong>
                  <span>{incident.severity} · {incident.status}</span>
                </div>
                {incident.description && <p>{incident.description}</p>}
                <small>
                  {incident.occurrenceCount} recorded failure{incident.occurrenceCount === 1 ? '' : 's'}
                  {' · Last failure '}{new Date(incident.lastFailureAt).toLocaleString()}
                </small>
                <button
                  type="button"
                  onClick={() => onRequestInvestigation?.({
                    serviceId: service.id,
                    endpointId: service.endpoint.id,
                    incidentId: incident.id,
                    serviceName: service.name,
                    incidentTitle: incident.title,
                    requestExplanation: true,
                  })}
                >
                  Explain this incident with AI
                </button>
              </li>
            ))}
          </ul>
        )}
        {incidents.filter((incident) => incident.status === 'RESOLVED').length > 0 && (
          <details>
            <summary>Show {incidents.filter((incident) => incident.status === 'RESOLVED').length} resolved incident(s)</summary>
            <ul>
              {incidents.filter((incident) => incident.status === 'RESOLVED').map((incident) => (
                <li key={incident.id}>
                  <div className="dependency-3d-incident-heading">
                    <strong>{incident.title}</strong>
                    <span>{incident.severity} · Resolved</span>
                  </div>
                  <small>{incident.occurrenceCount} recorded failure{incident.occurrenceCount === 1 ? '' : 's'}</small>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

/**
 * Renders the existing dependency graph layout in a Three.js scene.
 * Node positions come from the 2D graph layout, so the service topology
 * is not calculated a second time for this view.
 */
export default function DependencyGraph3D({ nodes, edges, selectedServiceId, onSelectService, onRequestInvestigation, aiReport }) {
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
              aiReport={aiReport}
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
        onRequestInvestigation={onRequestInvestigation}
      />
      {aiReport && (
        <section className="dependency-3d-ai-report" aria-live="polite" aria-labelledby="dependency-3d-ai-report-title">
          <div className="dependency-3d-ai-report-heading">
            <div>
              <p>AI Incident Assistant</p>
              <h4 id="dependency-3d-ai-report-title">{aiReport.endpoint?.name || 'Selected service'} explanation</h4>
            </div>
            <span>{aiReport.provider} · {aiReport.model}</span>
          </div>
          <p className="dependency-3d-ai-report-summary">{aiReport.summary}</p>
          <div className="dependency-3d-ai-report-columns">
            <div>
              <h5>Verified facts</h5>
              <ul>{aiReport.verifiedFacts.map((fact, index) => <li key={index}>{fact}</li>)}</ul>
            </div>
            <div>
              <h5>Possible causes · unconfirmed</h5>
              <ul>{aiReport.hypotheses.map((hypothesis, index) => <li key={index}>{hypothesis}</li>)}</ul>
            </div>
            <div>
              <h5>Suggested next steps</h5>
              <ul>{aiReport.recommendations.map((recommendation, index) => <li key={index}>{recommendation}</li>)}</ul>
            </div>
          </div>
          <p className="dependency-3d-ai-report-note">
            The VR panel summarizes this report. Possible causes are hypotheses and should be checked against the verified facts.
          </p>
        </section>
      )}
      <p className="dependency-3d-controls-hint">
        Drag to rotate · Scroll or pinch to zoom · Right-drag or two-finger drag to move · Tap or click a node to inspect it
      </p>
    </div>
  );
}
