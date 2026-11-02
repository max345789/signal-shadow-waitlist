import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import {
  ArrowClockwise,
  CheckCircle,
  Cloud,
  Cursor,
  FileText,
  FilmReel,
  FilmStrip,
  FolderOpen,
  Hand,
  HardDrives,
  ImageSquare,
  LockSimple,
  Monitor,
  Mountains,
  Play,
  Plus,
  Sparkle,
  UsersThree,
  VideoCamera,
  X,
} from "@phosphor-icons/react";
import "@fontsource/nunito-sans/400.css";
import "@fontsource/nunito-sans/600.css";
import "@fontsource/nunito-sans/700.css";
import "@xyflow/react/dist/style.css";

const ICONS = {
  start: FilmReel,
  brief: FileText,
  cast: UsersThree,
  environment: Mountains,
  storyboard: ImageSquare,
  video: VideoCamera,
  output: FolderOpen,
  check: CheckCircle,
  script: FileText,
  image: ImageSquare,
};

const CHARACTER_DESIGN_RULE = "For each named character, make a seven-square reference sheet: four full-body standing views on a plain white background (front, left side, right side, and back), plus three close-ups (front face, three-quarter face, and back of head). Preserve the same face, clothing, age, colors, and visual style across every view and shot.";

const initialNodes = [
  {
    id: "start",
    type: "workflow",
    position: { x: 35, y: 0 },
    data: {
      kind: "start",
      title: "Production Start",
      tone: "blue",
      description: "Load the approved movie brief by task code.",
      instructions: "Start the task named in the six-digit task code field. Load the approved task record and pass its source instructions to every connected node.",
      status: "idle",
    },
  },
  {
    id: "brief",
    type: "workflow",
    position: { x: 282, y: 0 },
    data: {
      kind: "brief",
      title: "MCP Brief & Script",
      tone: "orange",
      description: "Read every instruction from the task record.",
      instructions: "Read the complete approved prompt, script, dialogue, character design, storyboard, environment, and duration from the MCP task record. Keep the source version pinned.",
      details: ["Prompt + script", "Character + setting", "Dialogue + storyboard", "Duration · 30 sec"],
      status: "idle",
    },
  },
  {
    id: "cast",
    type: "workflow",
    position: { x: 528, y: 0 },
    data: {
      kind: "cast",
      title: "Character Design",
      tone: "mint",
      description: "Keep each named character consistent across the movie.",
      instructions: CHARACTER_DESIGN_RULE,
      details: ["Seven-view character sheet", "Face continuity", "Wardrobe continuity"],
      characters: [{ id: "character-1", name: "", photos: {} }],
      status: "idle",
    },
  },
  {
    id: "environment",
    type: "workflow",
    position: { x: 775, y: 0 },
    data: {
      kind: "environment",
      title: "Environment Design",
      tone: "blue",
      description: "Describe the setting and add visual references.",
      instructions: "Keep location, time of day, weather, lighting, colors, and set details consistent across every shot.",
      environmentDescription: "",
      referenceImages: [],
      details: ["Location", "Lighting + weather", "Color palette"],
      status: "idle",
    },
  },
  {
    id: "storyboard",
    type: "workflow",
    position: { x: 1022, y: 0 },
    data: {
      kind: "storyboard",
      title: "Storyboard",
      tone: "lavender",
      description: "Build the shot sequence from the locked script.",
      instructions: "Translate the approved script and dialogue into ordered storyboard shots. Keep scene timing, character positions, and visual continuity aligned.",
      details: ["Shot list", "Dialogue timing", "Character continuity"],
      status: "idle",
    },
  },
  {
    id: "video",
    type: "workflow",
    position: { x: 1268, y: 0 },
    data: {
      kind: "video",
      title: "Video Generation",
      tone: "blue",
      description: "Generate from the pinned script, cast, and storyboard.",
      instructions: "Generate exactly 30 seconds from the pinned script, dialogue, character photos, environment, and storyboard. Do not invent or change scenes.",
      details: ["Duration · 30 sec", "Route · Cloud", "Continuity lock on"],
      status: "idle",
      provider: "Cloud",
    },
  },
  {
    id: "output",
    type: "workflow",
    position: { x: 1515, y: 0 },
    data: {
      kind: "output",
      title: "Final Output",
      tone: "mint",
      description: "Check continuity, then save files by task code.",
      instructions: "Check the finished clip against the locked character design, script, dialogue, shot order, and environment. Save the approved result under the task-code folder.",
      details: ["Continuity gate", "/movies/565349"],
      status: "idle",
    },
  },
];

const initialEdges = [
  ["start", "brief"],
  ["brief", "cast"],
  ["cast", "environment"],
  ["environment", "storyboard"],
  ["storyboard", "video"],
  ["video", "output"],
].map(([source, target]) => ({
  id: source + "-" + target,
  source,
  target,
  type: "smoothstep",
  animated: false,
  style: { stroke: "#aeb5c2", strokeWidth: 1.8 },
}));

const palette = [
  { kind: "brief", title: "MCP Brief & Script", tone: "orange", description: "Retrieve the complete task brief." },
  { kind: "cast", title: "Character Design", tone: "mint", description: "Create a consistent seven-view character sheet." },
  { kind: "environment", title: "Environment Design", tone: "blue", description: "Describe the setting and add visual references.", instructions: "Keep location, time of day, weather, lighting, colors, and set details consistent across every shot.", environmentDescription: "", referenceImages: [], details: ["Location", "Lighting + weather", "Color palette"] },
  { kind: "storyboard", title: "Storyboard", tone: "lavender", description: "Turn the script into visual shots." },
  { kind: "video", title: "Video Generation", tone: "blue", description: "Generate a clip with a selected model." },
  { kind: "check", title: "Continuity Check", tone: "mint", description: "Check script, face, and scene continuity." },
  { kind: "output", title: "Final Output", tone: "orange", description: "Save movie files to the task folder." },
];

const CHARACTER_VIEWS = [
  { key: "standing-front", label: "Front", group: "Standing" },
  { key: "standing-left", label: "Left side", group: "Standing" },
  { key: "standing-right", label: "Right side", group: "Standing" },
  { key: "standing-back", label: "Back", group: "Standing" },
  { key: "face-front", label: "Face · front", group: "Close-up" },
  { key: "face-three-quarter", label: "Face · ¾ angle", group: "Close-up" },
  { key: "head-back", label: "Back of head", group: "Close-up" },
];


function WorkflowNode({ id, data, selected }) {
  const Icon = ICONS[data.kind] || Sparkle;
  const statusIcon = data.status === "done" ? <CheckCircle weight="fill" /> : null;
  const isRunning = data.status === "running";
  const nodePhotos = data.kind === "cast"
    ? (data.characters || []).flatMap((character) => Object.values(character.photos || {}).filter(Boolean))
    : data.kind === "environment"
      ? (data.referenceImages || [])
    : (data.images || []);

  return (
    <article className={"workflow-node tone-" + data.tone + (selected ? " is-selected" : "") + (isRunning ? " is-running" : "")}>
      {data.kind !== "start" && <Handle type="target" position={Position.Left} className="node-handle" />}
      <div className="node-heading">
        <span className="node-icon"><Icon size={18} weight="duotone" /></span>
        <strong>{data.title}</strong>
        <span className={"node-state " + (data.status || "idle")} aria-label={data.status || "not run"}>
          {statusIcon || (isRunning ? <ArrowClockwise className="spin" /> : null)}
        </span>
      </div>

      {data.kind === "start" ? (
        <div className="start-content">
          <div className="code-caption">6-DIGIT TASK CODE</div>
          <div className="node-code">#{data.taskCode || "------"}</div>
          <button className="node-run" onClick={(event) => { event.stopPropagation(); data.onRun?.(); }} disabled={data.running}>
            <Play size={14} weight="fill" />
            Run Flow with #{data.taskCode || "------"}
          </button>
        </div>
      ) : (
        <div className="node-content">
          {nodePhotos.length > 0 && (
            <div className="node-photo-strip" aria-label={`${nodePhotos.length} attached photos`}>
              {nodePhotos.slice(0, 3).map((photo) => <img key={photo.id} src={photo.url} alt={photo.name} title={photo.name} />)}
              {nodePhotos.length > 3 && <span>+{nodePhotos.length - 3}</span>}
            </div>
          )}
          {data.kind === "video" && <div className="video-preview"><FilmStrip size={36} weight="duotone" /></div>}
          {data.kind === "check" && <div className="check-preview"><LockSimple size={18} weight="duotone" /> Continuity lock</div>}
          <p>{data.kind === "environment" && data.environmentDescription ? data.environmentDescription : data.description}</p>
          {data.details?.length > 0 && (
            <ul className="node-details">
              {data.details.map((detail) => <li key={detail}><span className="detail-dot" />{detail}</li>)}
            </ul>
          )}
          {data.kind === "output" && (
            <button className="folder-link" onClick={(event) => { event.stopPropagation(); data.onOpenOutput?.(); }}>
              <FolderOpen size={15} weight="duotone" />
              /movies/{data.taskCode || "------"}
            </button>
          )}
        </div>
      )}
      {data.kind !== "output" && <Handle type="source" position={Position.Right} className="node-handle" />}
    </article>
  );
}

const nodeTypes = { workflow: WorkflowNode };
const TASK_API = "https://mcp.dabcloud.in/api/tasks";

function StatusPill({ icon: Icon, name, tone, onClick, open, status }) {
  return (
    <button className={"model-status " + tone + (open ? " is-open" : "")} onClick={onClick} title={name + " connection status"}>
      <span className={"status-dot " + status} />
      <Icon size={16} weight="duotone" />
      <span>{name}</span>
    </button>
  );
}

function NodeInspector({ node, taskCode, onClose, onProviderChange, onInstructionChange, onCharacterNameChange, onCharacterAdd, onCharacterPhotoUpload, onCharacterPhotoRemove, onEnvironmentDescriptionChange, onEnvironmentPhotoUpload, onEnvironmentPhotoRemove }) {
  if (!node) return null;
  const data = node.data;
  const photoCount = (data.characters || []).reduce((total, character) => total + Object.values(character.photos || {}).filter(Boolean).length, 0);
  return (
    <aside className="node-inspector" aria-label={data.title + " options"}>
      <div className="inspector-head">
        <div>
          <span className="inspector-eyebrow">SELECTED NODE</span>
          <h2>{data.title}</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close node panel"><X size={18} /></button>
      </div>
      <p className="inspector-description">{data.description}</p>

      {data.kind === "brief" && (
        <div className="instruction-list">
          {["Prompt + style", "Script and dialogue", "Character design", "Storyboard shots", "Environment", "Duration · 00:30"].map((item) => (
            <div className="instruction-row" key={item}><LockSimple size={13} weight="fill" /><span>{item}</span><strong>From task</strong></div>
          ))}
        </div>
      )}

      <label className="field-label" htmlFor={"instructions-" + node.id}>Instructions for this node</label>
      <textarea
        id={"instructions-" + node.id}
        className="node-instructions"
        value={data.instructions || data.description || ""}
        onChange={(event) => onInstructionChange(node.id, event.target.value)}
        placeholder="Add instructions for this step…"
        rows={data.kind === "brief" ? 5 : 6}
      />
      <div className="field-hint">This note is passed to this workflow step.</div>

      {data.kind === "cast" && (
        <section className="panel-section">
          <div className="section-title">
            <span>Character design sheets</span>
            <small>{photoCount} photos · 7 per character</small>
          </div>
          <p className="character-sheet-rule">Each character uses 4 full-body standing views on white and 3 square close-ups. Keep the whole figure visible in standing shots.</p>
          {(data.characters || []).map((character, characterIndex) => (
            <section className="character-sheet" key={character.id}>
              <div className="character-sheet-heading">
                <span>Character {characterIndex + 1}</span>
                <small>{Object.values(character.photos || {}).filter(Boolean).length}/7 views</small>
              </div>
              <label className="field-label" htmlFor={`character-name-${node.id}-${character.id}`}>Character name</label>
              <input
                id={`character-name-${node.id}-${character.id}`}
                className="text-field"
                value={character.name}
                onChange={(event) => onCharacterNameChange(node.id, character.id, event.target.value)}
                placeholder="e.g. Mira"
              />
              <div className="character-view-grid">
                {CHARACTER_VIEWS.map((view, viewIndex) => {
                  const photo = character.photos?.[view.key];
                  const inputId = `character-photo-${node.id}-${character.id}-${view.key}`;
                  return (
                    <div className="character-view-slot" key={view.key}>
                      <label className="character-slot-image" htmlFor={inputId} title={`Add ${view.label} photo`}>
                        {photo ? <img src={photo.url} alt={`${character.name || `Character ${characterIndex + 1}`} · ${view.label}`} /> : <span className="character-slot-empty"><ImageSquare size={19} weight="duotone" /><small>Add photo</small></span>}
                        <input
                          id={inputId}
                          type="file"
                          accept="image/*"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) onCharacterPhotoUpload(node.id, character.id, view.key, file);
                            event.target.value = "";
                          }}
                        />
                      </label>
                      {photo && <button className="character-photo-remove" onClick={() => onCharacterPhotoRemove(node.id, character.id, view.key)} aria-label={`Remove ${view.label} photo`}><X size={11} /></button>}
                      <span className="character-view-number">{String(viewIndex + 1).padStart(2, "0")}</span>
                      <strong>{view.label}</strong>
                      <small>{view.group}</small>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          <button className="add-character-button" onClick={() => onCharacterAdd(node.id)}><Plus size={14} />Add character sheet</button>
          <div className="field-hint">Uploaded images stay in this browser preview and are not sent to a model.</div>
        </section>
      )}

      {data.kind === "environment" && (
        <section className="panel-section">
          <label className="field-label" htmlFor={`environment-description-${node.id}`}>Environment description</label>
          <textarea
            id={`environment-description-${node.id}`}
            className="node-instructions environment-description"
            value={data.environmentDescription || ""}
            onChange={(event) => onEnvironmentDescriptionChange(node.id, event.target.value)}
            placeholder="Describe the place, time of day, weather, lighting, colors, materials, and atmosphere…"
            rows={5}
          />
          <div className="section-title environment-reference-title">
            <span>Environment reference images</span>
            <small>{data.referenceImages?.length || 0} added</small>
          </div>
          <label className="upload-button" htmlFor={`environment-photos-${node.id}`}>
            <ImageSquare size={16} weight="duotone" />
            Upload environment references
            <input
              id={`environment-photos-${node.id}`}
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                onEnvironmentPhotoUpload(node.id, Array.from(event.target.files || []));
                event.target.value = "";
              }}
            />
          </label>
          {data.referenceImages?.length > 0 && (
            <div className="photo-grid">
              {data.referenceImages.map((photo) => (
                <div className="photo-thumb" key={photo.id}>
                  <img src={photo.url} alt={photo.name} />
                  <span title={photo.name}>{photo.name}</span>
                  <button onClick={() => onEnvironmentPhotoRemove(node.id, photo.id)} aria-label={`Remove ${photo.name}`}><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="field-hint">These references belong to the environment node and stay in this browser preview.</div>
        </section>
      )}

      {data.kind === "video" && (
        <section className="panel-section">
          <label className="field-label" htmlFor="provider-select">Model route</label>
          <select id="provider-select" value={data.provider || "Cloud"} onChange={(event) => onProviderChange(node.id, event.target.value)}>
            <option>Cloud</option>
            <option>Kaggle</option>
            <option>Local</option>
          </select>
          <div className="inspector-row"><span>Duration</span><strong>30 seconds</strong></div>
          <div className="inspector-row"><span>Source</span><strong>Task #{taskCode}</strong></div>
        </section>
      )}

      {data.kind === "output" && (
        <section className="panel-section">
          <label className="field-label" htmlFor="output-folder">Output folder</label>
          <input className="text-field" id="output-folder" value={`/movies/${taskCode}`} readOnly />
          <div className="field-hint">Final video and supporting files are grouped by task code.</div>
        </section>
      )}

      <div className="inspector-footer"><span className={"status-dot " + (data.status === "done" ? "done" : "unconfigured")} /> {data.status === "done" ? "Completed" : "Waiting for connection"}</div>
    </aside>
  );
}

function NodeNavigator({ nodes, taskCode, onSelect, onAdd, addOpen, onToggleAdd }) {
  const draggedNode = useRef(false);
  return (
    <aside className="node-inspector node-navigator" aria-label="Workflow nodes">
      <div className="inspector-head">
        <div>
          <span className="inspector-eyebrow">TASK #{taskCode || "------"}</span>
          <h2>Workflow nodes</h2>
        </div>
      </div>
      <p className="inspector-description">Select a node to edit its instructions and data.</p>

      <div className="workflow-node-list" aria-label="Current workflow nodes">
        {nodes.map((node) => {
          const Icon = ICONS[node.data.kind] || Sparkle;
          return (
            <button
              key={node.id}
              className={`workflow-node-row tone-${node.data.tone}`}
              onClick={() => onSelect(node.id)}
            >
              <span className="workflow-row-icon"><Icon size={16} weight="duotone" /></span>
              <span className="workflow-row-copy">
                <strong>{node.data.title}</strong>
                <small>{node.data.status === "done" ? "Completed" : "Waiting for connection"}</small>
              </span>
              <span className="workflow-row-arrow">›</span>
            </button>
          );
        })}
      </div>

      <section className="add-step-section">
        <button className="add-step-toggle" onClick={onToggleAdd} aria-expanded={addOpen}>
          <Plus size={15} />
          <span>Add a node</span>
          <span className="add-step-chevron">{addOpen ? "−" : "+"}</span>
        </button>
        {addOpen && (
          <div className="sidebar-node-library" aria-label="Add a workflow node">
            {palette.map((item) => {
              const Icon = ICONS[item.kind] || Sparkle;
              return (
                <button
                  key={item.kind}
                  className={`sidebar-node-tile tone-${item.tone}`}
                  draggable
                  onClick={() => {
                    if (draggedNode.current) {
                      draggedNode.current = false;
                      return;
                    }
                    onAdd(item);
                  }}
                  onDragStart={(event) => {
                    draggedNode.current = true;
                    event.dataTransfer.setData("application/reactflow", item.kind);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => window.setTimeout(() => { draggedNode.current = false; }, 0)}
                  title="Drag onto the canvas or click to add"
                >
                  <Icon size={16} weight="duotone" />
                  <span><strong>{item.title}</strong><small>{item.description}</small></span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </aside>
  );
}

function OutputDialog({ open, onClose, taskCode, outputData }) {
  if (!open) return null;
  const files = Array.isArray(outputData?.files) ? outputData.files : [];
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="output-dialog" role="dialog" aria-modal="true" aria-labelledby="output-title" onClick={(event) => event.stopPropagation()}>
        <button className="icon-button dialog-close" onClick={onClose} aria-label="Close output"><X size={18} /></button>
        <div className="dialog-icon"><FolderOpen size={22} weight="duotone" /></div>
        <span className="inspector-eyebrow">TASK OUTPUT</span>
        <h2 id="output-title">/movies/{taskCode}</h2>
        <p>{outputData?.message || (outputData ? "The task endpoint returned successfully. Output files, if any, are listed below." : "No files have been returned by the task endpoint yet.")}</p>
        {files.map((file, index) => (
          <div className="file-row" key={file.id || file.path || file.url || index}>
            <FileText size={18} />
            <span>{file.name || file.path || "Output file"}</span>
            {file.url && <a href={file.url} target="_blank" rel="noreferrer">Open</a>}
          </div>
        ))}
        {outputData?.outputPath && <div className="file-row"><FolderOpen size={18} /><span>{outputData.outputPath}</span></div>}
        <button className="primary-button dialog-action" onClick={onClose}>Close</button>
      </section>
    </div>
  );
}

function Workspace() {
  const { fitView, screenToFlowPosition } = useReactFlow();
  const [taskCode, setTaskCode] = useState("565349");
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [panMode, setPanMode] = useState(false);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState("");
  const [outputData, setOutputData] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [connectionMenu, setConnectionMenu] = useState("");
  const connectionState = { Cloud: "unconfigured", Kaggle: "unconfigured", Local: "unconfigured" };

  const runWorkflow = useCallback(() => {
    const code = taskCode.replace(/\D/g, "");
    if (!/^\d{6}$/.test(code)) {
      setRunMessage("Enter a 6-digit task code to load the production brief.");
      window.setTimeout(() => setRunMessage(""), 3000);
      return;
    }
    setRunning(true);
    setOutputData(null);
    setRunMessage("Sending task #" + code + " to the production task endpoint…");
    fetch(`${TASK_API}/${code}/complete`, { method: "POST", headers: { Accept: "application/json" } })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.success === false) {
          throw new Error(result.error || result.message || `Task endpoint returned HTTP ${response.status}.`);
        }
        setOutputData(result);
        const resultStatus = String(result.status || "").toLowerCase();
        if (["completed", "complete", "done"].includes(resultStatus) || result.completed === true) {
          setNodes((current) => current.map((node) => ({ ...node, data: { ...node.data, status: "done" } })));
          setRunMessage(result.message || `Task #${code} completed by the production endpoint.`);
        } else if (response.status === 202 || ["queued", "running", "processing"].includes(resultStatus)) {
          setRunMessage(result.message || `Task #${code} was accepted by the production endpoint.`);
        } else {
          setRunMessage(result.message || `The production endpoint accepted task #${code}.`);
        }
      })
      .catch((error) => {
        setRunMessage(`Run failed: ${error.message}`);
      })
      .finally(() => setRunning(false));
  }, [taskCode]);

  const displayNodes = useMemo(
    () => nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        details: node.data.details?.map((detail) => detail.replace("565349", taskCode.replace(/\D/g, "").slice(0, 6))),
        taskCode: taskCode.replace(/\D/g, "").slice(0, 6),
        onRun: runWorkflow,
        onOpenOutput: () => setDialogOpen(true),
        running,
      },
    })),
    [nodes, taskCode, runWorkflow, running],
  );
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => fitView({ padding: 0.06, duration: 220 }));
    return () => window.cancelAnimationFrame(frame);
  }, [selectedNodeId, fitView]);

  const onNodesChange = useCallback((changes) => setNodes((current) => applyNodeChanges(changes, current)), []);
  const onEdgesChange = useCallback((changes) => setEdges((current) => applyEdgeChanges(changes, current)), []);
  const onConnect = useCallback((connection) => setEdges((current) => addEdge({
    ...connection,
    type: "smoothstep",
    style: { stroke: "#aeb5c2", strokeWidth: 1.8 },
  }, current)), []);

  const addNode = useCallback((definition, dropPosition) => {
    const id = definition.kind + "-" + Math.random().toString(36).slice(2, 7);
    const viewport = document.querySelector(".flow-viewport")?.getBoundingClientRect();
    const position = dropPosition || screenToFlowPosition({
      x: (viewport?.left || 0) + (viewport?.width || window.innerWidth) * 0.5,
      y: (viewport?.top || 0) + (viewport?.height || window.innerHeight) * 0.5,
    });
    const Icon = ICONS[definition.kind] || Sparkle;
    const nodeData = {
      ...definition,
      instructions: definition.kind === "cast" ? CHARACTER_DESIGN_RULE : definition.instructions,
      details: definition.kind === "check" ? ["Script lock", "Character match", "Scene order"] : (definition.details || []),
      characters: definition.kind === "cast" ? [{ id: "character-" + Math.random().toString(36).slice(2, 7), name: "", photos: {} }] : definition.characters,
      status: "idle",
      Icon,
    };
    setNodes((current) => [...current, {
      id,
      type: "workflow",
      position,
      data: nodeData,
    }]);
    setShowAddMenu(false);
    setSelectedNodeId(id);
  }, [screenToFlowPosition]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback((event) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData("application/reactflow");
    const definition = palette.find((item) => item.kind === kind);
    if (!definition) return;
    addNode(definition, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }, [addNode, screenToFlowPosition]);

  const changeProvider = (nodeId, provider) => {
    setNodes((current) => current.map((node) => node.id === nodeId ? {
      ...node,
      data: { ...node.data, provider, details: ["Duration · 30 sec", "Route · " + provider] },
    } : node));
  };

  const changeInstructions = (nodeId, instructions) => {
    setNodes((current) => current.map((node) => node.id === nodeId ? {
      ...node,
      data: { ...node.data, instructions },
    } : node));
  };

  const changeEnvironmentDescription = (nodeId, environmentDescription) => {
    setNodes((current) => current.map((node) => node.id === nodeId ? {
      ...node,
      data: { ...node.data, environmentDescription },
    } : node));
  };

  const addEnvironmentPhotos = (nodeId, files) => {
    const photos = files
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => ({
        id: (globalThis.crypto?.randomUUID?.() || Date.now() + "-" + Math.random().toString(36).slice(2)),
        name: file.name,
        url: URL.createObjectURL(file),
      }));
    if (!photos.length) return;
    setNodes((current) => current.map((node) => node.id === nodeId ? {
      ...node,
      data: { ...node.data, referenceImages: [...(node.data.referenceImages || []), ...photos] },
    } : node));
  };

  const removeEnvironmentPhoto = (nodeId, photoId) => {
    const photo = nodes.find((node) => node.id === nodeId)?.data.referenceImages?.find((item) => item.id === photoId);
    if (photo?.url?.startsWith("blob:")) URL.revokeObjectURL(photo.url);
    setNodes((current) => current.map((node) => node.id !== nodeId ? node : {
      ...node,
      data: { ...node.data, referenceImages: node.data.referenceImages.filter((item) => item.id !== photoId) },
    }));
  };

  const changeCharacterName = (nodeId, characterId, name) => {
    setNodes((current) => current.map((node) => node.id === nodeId ? {
      ...node,
      data: {
        ...node.data,
        characters: node.data.characters.map((character) => character.id === characterId ? { ...character, name } : character),
      },
    } : node));
  };

  const addCharacterSheet = (nodeId) => {
    const character = { id: "character-" + Math.random().toString(36).slice(2, 7), name: "", photos: {} };
    setNodes((current) => current.map((node) => {
      if (node.id !== nodeId) return node;
      return { ...node, data: { ...node.data, characters: [...(node.data.characters || []), character] } };
    }));
  };

  const addCharacterPhoto = (nodeId, characterId, slotKey, file) => {
    if (!file.type.startsWith("image/")) return;
    const currentPhoto = nodes.find((node) => node.id === nodeId)?.data.characters?.find((character) => character.id === characterId)?.photos?.[slotKey];
    if (currentPhoto?.url?.startsWith("blob:")) URL.revokeObjectURL(currentPhoto.url);
    const photo = {
      id: (globalThis.crypto?.randomUUID?.() || Date.now() + "-" + Math.random().toString(36).slice(2)),
      name: file.name,
      url: URL.createObjectURL(file),
    };
    setNodes((current) => current.map((node) => node.id !== nodeId ? node : {
      ...node,
      data: {
        ...node.data,
        characters: node.data.characters.map((character) => character.id !== characterId ? character : {
          ...character,
          photos: { ...character.photos, [slotKey]: photo },
        }),
      },
    }));
  };

  const removeCharacterPhoto = (nodeId, characterId, slotKey) => {
    const currentPhoto = nodes.find((node) => node.id === nodeId)?.data.characters?.find((character) => character.id === characterId)?.photos?.[slotKey];
    if (currentPhoto?.url?.startsWith("blob:")) URL.revokeObjectURL(currentPhoto.url);
    setNodes((current) => current.map((node) => node.id !== nodeId ? node : {
      ...node,
      data: {
        ...node.data,
        characters: node.data.characters.map((character) => {
          if (character.id !== characterId) return character;
          const photos = { ...character.photos };
          delete photos[slotKey];
          return { ...character, photos };
        }),
      },
    }));
  };

  return (
    <main className="studio-shell">
      <header className="topbar" aria-label="Workflow controls">
        <div className="topbar-center">
          <label className="code-input-wrap">
            <span>Task code</span>
            <input
              aria-label="Six-digit task code"
              value={taskCode}
              onChange={(event) => setTaskCode(event.target.value.replace(/[^\d#\s]/g, "").slice(0, 20))}
              onKeyDown={(event) => { if (event.key === "Enter") runWorkflow(); }}
            />
          </label>
          <button className="primary-button top-run" onClick={runWorkflow}>
            <Play size={15} weight="fill" /> {running ? "Sending" : "Run"}
          </button>
        </div>
        <div className="connection-group" aria-label="Model connections">
          <div className="connection-wrap">
            <StatusPill icon={Cloud} name="Cloud" tone="cloud" status={connectionState.Cloud} open={connectionMenu === "Cloud"} onClick={() => setConnectionMenu(connectionMenu === "Cloud" ? "" : "Cloud")} />
            {connectionMenu === "Cloud" && <div className="connection-popover"><strong>Cloud models</strong><span>Not connected · add a provider endpoint and credentials to enable generation.</span></div>}
          </div>
          <div className="connection-wrap">
            <StatusPill icon={HardDrives} name="Kaggle" tone="kaggle" status={connectionState.Kaggle} open={connectionMenu === "Kaggle"} onClick={() => setConnectionMenu(connectionMenu === "Kaggle" ? "" : "Kaggle")} />
            {connectionMenu === "Kaggle" && <div className="connection-popover"><strong>Kaggle model</strong><span>Not connected · add the hosted MCP URL and the Kaggle model adapter.</span></div>}
          </div>
          <div className="connection-wrap">
            <StatusPill icon={Monitor} name="Local" tone="local" status={connectionState.Local} open={connectionMenu === "Local"} onClick={() => setConnectionMenu(connectionMenu === "Local" ? "" : "Local")} />
            {connectionMenu === "Local" && <div className="connection-popover"><strong>Local model bridge</strong><span>Not connected · add a reachable local bridge URL before running.</span></div>}
          </div>
        </div>
      </header>

      <section className="canvas-shell has-inspector" aria-label="Workflow canvas">
        {selectedNode && (
          <NodeInspector
            node={selectedNode}
            taskCode={taskCode.replace(/\D/g, "").slice(0, 6)}
            onClose={() => setSelectedNodeId(null)}
            onProviderChange={changeProvider}
            onInstructionChange={changeInstructions}
            onCharacterNameChange={changeCharacterName}
            onCharacterAdd={addCharacterSheet}
            onCharacterPhotoUpload={addCharacterPhoto}
            onCharacterPhotoRemove={removeCharacterPhoto}
            onEnvironmentDescriptionChange={changeEnvironmentDescription}
            onEnvironmentPhotoUpload={addEnvironmentPhotos}
            onEnvironmentPhotoRemove={removeEnvironmentPhoto}
          />
        )}
        {!selectedNode && (
          <NodeNavigator
            nodes={nodes}
            taskCode={taskCode.replace(/\D/g, "").slice(0, 6)}
            onSelect={setSelectedNodeId}
            onAdd={addNode}
            addOpen={showAddMenu}
            onToggleAdd={() => setShowAddMenu((open) => !open)}
          />
        )}
        <div className="flow-viewport is-shifted">
          <div className="canvas-run-status" role="status" aria-live="polite">
            <span className={"status-dot " + (running ? "active" : runMessage.toLowerCase().includes("completed") ? "done" : runMessage.toLowerCase().includes("failed") ? "paused" : "unconfigured")} />
            <span>{runMessage || "Task API reachable · model connections not verified"}</span>
          </div>
          <ReactFlow
            nodes={displayNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onNodeClick={(_, node) => { setSelectedNodeId(node.id); setConnectionMenu(""); }}
            onPaneClick={() => { setSelectedNodeId(null); setShowAddMenu(false); setConnectionMenu(""); }}
            fitView
            fitViewOptions={{ padding: 0.06, minZoom: 0.45, maxZoom: 0.98 }}
            minZoom={0.35}
            maxZoom={1.2}
            panOnDrag={panMode ? true : [1, 2]}
            selectionOnDrag={!panMode}
            deleteKeyCode={["Backspace", "Delete"]}
            nodesDraggable
            nodesConnectable
            elementsSelectable
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ type: "smoothstep" }}
          />

          <div className="canvas-tools" aria-label="Canvas tools" onClick={(event) => event.stopPropagation()}>
            <button className={!panMode ? "tool-active" : ""} onClick={() => setPanMode(false)} title="Select nodes"><Cursor size={14} />Select</button>
            <button className={panMode ? "tool-active" : ""} onClick={() => setPanMode(true)} title="Pan canvas"><Hand size={14} />Pan</button>
            <button onClick={() => fitView({ padding: 0.06, duration: 320 })} title="Fit workflow to view">Fit View</button>
          </div>
        </div>
        {runMessage && (
          <div className={"toast " + (runMessage.includes("not found") || runMessage.includes("Enter") ? "toast-error" : "toast-success")} role="status">
            {runMessage.includes("complete") ? <CheckCircle size={17} weight="fill" /> : <Sparkle size={17} weight="fill" />}
            {runMessage}
            <button onClick={() => setRunMessage("")} aria-label="Dismiss message"><X size={14} /></button>
          </div>
        )}
      </section>
      <OutputDialog open={dialogOpen} onClose={() => setDialogOpen(false)} taskCode={taskCode.replace(/\D/g, "").slice(0, 6)} outputData={outputData} />
    </main>
  );
}

export function App() {
  const [entered, setEntered] = useState(false);

  return (
    entered ? (
      <ReactFlowProvider>
        <Workspace />
      </ReactFlowProvider>
    ) : (
      <AuthScreen onPreview={() => setEntered(true)} />
    )
  );
}

function AuthScreen({ onPreview }) {
  const [mode, setMode] = useState("create");
  const [notice, setNotice] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const isCreate = mode === "create";

  function submitAuth(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") || "");
    const confirm = String(data.get("confirmPassword") || "");
    if (isCreate && password !== confirm) {
      setNotice("Those passwords don’t match yet.");
      return;
    }
    setNotice("Account sign-in isn’t connected yet. Open preview to explore the studio.");
    form.reset();
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setNotice("");
  }

  return (
    <main className="auth-page">
      <div className="auth-frame">
        <section className="auth-art" aria-label="Film creator working in a bright production studio">
          <img src="/assets/studio-auth-illustration.png" alt="A filmmaker planning a movie at a desk in a sunny studio" />
          <div className="auth-art-shade" />
          <div className="auth-art-caption">
            <div className="auth-wordmark"><span className="auth-mark"><FilmReel size={19} weight="fill" /></span><span>DabCloud <b>Studio</b></span></div>
            <p>From first frame to final cut.</p>
          </div>
          <span className="auth-art-pill"><Sparkle size={13} weight="fill" /> Your next story starts here</span>
        </section>

        <section className="auth-card" aria-labelledby="auth-heading">
          <div className="auth-card-brand"><span className="auth-brand-glyph"><Sparkle size={17} weight="fill" /></span>DabCloud <b>Studio</b></div>
          <div className="auth-heading-block">
            <div className="auth-eyebrow">YOUR CREATIVE WORKSPACE</div>
            <h1 id="auth-heading">{isCreate ? <>Create your<br />account</> : <>Welcome<br />back</>}</h1>
            <p>{isCreate ? "Keep every scene, character, and idea in sync." : "Pick up where your next movie begins."}</p>
          </div>

          <form className="auth-form" onSubmit={submitAuth}>
            <label className="auth-field">
              <span>Email address</span>
              <input type="email" name="email" autoComplete="email" placeholder="you@example.com" required />
            </label>
            <label className="auth-field auth-password-field">
              <span>Password</span>
              <div className="auth-password-wrap">
                <input type={showPassword ? "text" : "password"} name="password" autoComplete={isCreate ? "new-password" : "current-password"} placeholder="At least 8 characters" minLength={8} required />
                <button type="button" className="auth-show-password" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button>
              </div>
            </label>
            {isCreate && <label className="auth-field"><span>Confirm password</span><input type={showPassword ? "text" : "password"} name="confirmPassword" autoComplete="new-password" placeholder="Enter your password again" minLength={8} required /></label>}
            {!isCreate && <button className="auth-forgot" type="button" onClick={() => setNotice("Password reset isn’t connected yet.")}>Forgot password?</button>}
            <button className="auth-submit" type="submit">{isCreate ? "Create account" : "Sign in"}<span aria-hidden="true">→</span></button>
          </form>

          <div className="auth-divider"><span />or continue with<span /></div>
          <button className="auth-google" type="button" onClick={() => setNotice("Google sign-in isn’t connected yet.")}><span className="google-g">G</span>Continue with Google</button>
          {notice && <p className="auth-notice" role="status">{notice}</p>}
          <p className="auth-terms">By continuing, you agree to our <a href="#terms" onClick={(event) => event.preventDefault()}>Terms</a> and <a href="#privacy" onClick={(event) => event.preventDefault()}>Privacy Policy</a>.</p>
          <p className="auth-switch">{isCreate ? "Already have an account?" : "New to DabCloud Studio?"} <button type="button" onClick={() => switchMode(isCreate ? "login" : "create")}>{isCreate ? "Sign in" : "Create account"}</button></p>
          <button className="auth-preview" type="button" onClick={onPreview}>Explore the studio preview <span aria-hidden="true">↗</span></button>
        </section>
      </div>
    </main>
  );
}
