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
  FloppyDisk,
  FolderOpen,
  Hand,
  HardDrives,
  ImageSquare,
  LockSimple,
  Monitor,
  Mountains,
  Play,
  Plus,
  TerminalWindow,
  Sparkle,
  UsersThree,
  VideoCamera,
  X,
} from "@phosphor-icons/react";
import "@fontsource/nunito-sans/400.css";
import "@fontsource/nunito-sans/600.css";
import "@fontsource/nunito-sans/700.css";
import "@xyflow/react/dist/style.css";
import { isSupabaseConfigured, supabase } from "./lib/supabase.js";
import { validateTaskCode, validateWorkflow } from "./lib/workflow.js";

async function makePersistentImage(file) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Choose an image smaller than 15 MB.");
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  let scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  let image = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    image = canvas.toDataURL("image/webp", Math.max(0.48, 0.76 - attempt * 0.05));
    if (image.length <= 180_000) break;
    scale *= 0.78;
  }
  bitmap.close();
  if (image.length > 240_000) throw new Error("This image could not be compressed enough. Choose a smaller image.");
  return image;
}

const ICONS = {
  start: FilmReel,
  brief: FileText,
  cast: UsersThree,
  environment: Mountains,
  storyboard: ImageSquare,
  video: VideoCamera,
  kaggle: HardDrives,
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
      provider: "Kaggle",
    },
  },
  {
    id: "kaggle",
    type: "workflow",
    position: { x: 1515, y: 0 },
    data: {
      kind: "kaggle",
      title: "Kaggle Run",
      tone: "orange",
      description: "Trigger the saved Kaggle notebook for this task.",
      instructions: "Run the configured saved Kaggle notebook with the approved task and workflow instructions. Return execution status and generated files to the final output node.",
      notebookSlug: "sara8877/dabcloudbp-dual-gpu-30s-video-engine",
      notebookLabel: "DabCloudBP Dual GPU 30s Video Engine",
      notebookUrl: "https://www.kaggle.com/code/sara8877/dabcloudbp-dual-gpu-30s-video-engine",
      status: "idle",
    },
  },
  {
    id: "output",
    type: "workflow",
    position: { x: 1760, y: 0 },
    data: {
      kind: "output",
      title: "Final Output",
      tone: "mint",
      description: "Check continuity, then save files by task code.",
      instructions: "Check the finished clip against the locked character design, script, dialogue, shot order, and environment. Save the approved result under the task-code folder.",
      details: ["Continuity gate", "SCENES/565349"],
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
  ["video", "kaggle"],
  ["kaggle", "output"],
].map(([source, target]) => ({
  id: source + "-" + target,
  source,
  target,
  type: "smoothstep",
  animated: false,
  style: { stroke: "#aeb5c2", strokeWidth: 1.8 },
}));

const palette = [
  { kind: "start", title: "Task Code", tone: "blue", description: "Add a six-digit production trigger." },
  { kind: "brief", title: "MCP Brief & Script", tone: "orange", description: "Retrieve the complete task brief." },
  { kind: "cast", title: "Character Design", tone: "mint", description: "Create a consistent seven-view character sheet." },
  { kind: "environment", title: "Environment Design", tone: "blue", description: "Describe the setting and add visual references.", instructions: "Keep location, time of day, weather, lighting, colors, and set details consistent across every shot.", environmentDescription: "", referenceImages: [], details: ["Location", "Lighting + weather", "Color palette"] },
  { kind: "storyboard", title: "Storyboard", tone: "lavender", description: "Turn the script into visual shots." },
  { kind: "video", title: "Video Generation", tone: "blue", description: "Generate a clip with a selected model." },
  { kind: "kaggle", title: "Kaggle Run", tone: "orange", description: "Trigger your saved Kaggle notebook." },
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

function normalizeKaggleOutputFiles(payload) {
  const result = payload?.result || payload?.output || payload?.data || payload || {};
  const candidates = result.files || result.outputFiles || result.outputs || result.artifacts || (result.outputFile ? [result.outputFile] : []);
  const files = Array.isArray(candidates) ? candidates : [candidates];
  return files.map((file, index) => {
    if (typeof file === "string") return { fileName: file.split("/").pop() || `output-${index + 1}`, url: file };
    const url = file.url || file.downloadUrl || file.download_url || file.outputUrl || file.videoUrl || file.fileUrl || file.artifactUrl;
    const fileName = file.fileName || file.name || file.filename || file.path?.split("/").pop() || fileNameFromUrl(url) || `output-${index + 1}`;
    const data = file.dataUrl || (file.base64 ? `data:${file.mimeType || file.contentType || "application/octet-stream"};base64,${file.base64}` : "");
    return url || data ? { ...file, fileName, url: url || data } : null;
  }).filter(Boolean);
}

function fileNameFromUrl(url) {
  try { return new URL(url).pathname.split("/").pop(); } catch { return ""; }
}


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
          {data.kind === "kaggle" && <div className="check-preview"><HardDrives size={18} weight="duotone" /> Saved notebook</div>}
          {data.kind === "check" && <div className="check-preview"><LockSimple size={18} weight="duotone" /> Continuity lock</div>}
          <p>{data.kind === "environment" && data.environmentDescription ? data.environmentDescription : data.description}</p>
          {data.details?.length > 0 && (
            <ul className="node-details">
              {data.details.map((detail) => <li key={detail}><span className="detail-dot" />{detail}</li>)}
            </ul>
          )}
          {data.kind === "output" && (
            <div className="output-node-actions">
              <div className="folder-link"><FolderOpen size={15} weight="duotone" /> SCENES / {data.taskCode || "------"}</div>
              <button className="folder-link output-files-button" onClick={(event) => { event.stopPropagation(); data.onOpenOutput?.(); }}>
                <FileText size={15} weight="duotone" /> {data.outputFiles?.length ? `${data.outputFiles.length} Kaggle output${data.outputFiles.length === 1 ? "" : "s"}` : "View outputs"}
              </button>
            </div>
          )}
          {data.kind === "kaggle" && (
            <div className="kaggle-node-actions">
              <div className="kaggle-node-name">{data.notebookLabel || "DabCloud 30s Video Engine"}</div>
              <button className="node-run" onClick={(event) => { event.stopPropagation(); data.onKaggleRun?.(); }} disabled={data.running}>
                <Play size={14} weight="fill" /> {data.running ? "Sending to Kaggle…" : `Run with #${data.taskCode || "------"}`}
              </button>
              <a className="folder-link kaggle-notebook-link" href={data.notebookUrl || "https://www.kaggle.com/code/sara8877/dabcloudbp-dual-gpu-30s-video-engine"} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Open saved notebook ↗</a>
            </div>
          )}
        </div>
      )}
      {data.kind !== "output" && <Handle type="source" position={Position.Right} className="node-handle" />}
    </article>
  );
}

const nodeTypes = { workflow: WorkflowNode };

function StatusPill({ icon: Icon, name, tone, onClick, open, status }) {
  return (
    <button className={"model-status " + tone + (open ? " is-open" : "")} onClick={onClick} title={name + " connection status"}>
      <span className={"status-dot " + status} />
      <Icon size={16} weight="duotone" />
      <span>{name}</span>
    </button>
  );
}

function TerminalPanel({ open, tab, onTabChange, onClose, lines, command, onCommandChange, onCommand, connections, onConnectionChange, onTest, connectionStates, saving, kaggleStatus, kaggleTelemetry }) {
  if (!open) return null;
  return (
    <section className="pipeline-terminal" aria-label="Pipeline terminal">
      <header className="terminal-header">
        <div className="terminal-title"><TerminalWindow size={17} /><strong>Pipeline terminal</strong><span className="terminal-live-dot" />{saving ? "saving" : "ready"}</div>
        <div className="terminal-header-actions">
          <button className={tab === "terminal" ? "terminal-tab active" : "terminal-tab"} onClick={() => onTabChange("terminal")}>Terminal</button>
          <button className={tab === "connections" ? "terminal-tab active" : "terminal-tab"} onClick={() => onTabChange("connections")}>Connections</button>
          <button className="icon-button terminal-close" onClick={onClose} aria-label="Close pipeline terminal"><X size={17} /></button>
        </div>
      </header>
      {tab === "terminal" ? (
        <>
          <div className="terminal-output" role="log" aria-live="polite">
            {lines.map((line, index) => <div className={"terminal-line " + line.kind} key={index}><span>{line.prompt ? "$" : "·"}</span><pre>{line.text}</pre></div>)}
          </div>
          <form className="terminal-command" onSubmit={onCommand}>
            <span aria-hidden="true">$</span>
            <input value={command} onChange={(event) => onCommandChange(event.target.value)} aria-label="Pipeline terminal command" placeholder="help · status · test local" autoComplete="off" spellCheck="false" />
            <button type="submit" aria-label="Run terminal command"><Play size={14} weight="fill" /></button>
          </form>
          <div className="terminal-hint">Commands: <code>help</code> <code>status</code> <code>test kaggle</code> <code>test local</code> <code>models local</code> <code>save</code> <code>run</code></div>
        </>
      ) : (
        <div className="terminal-connections">
          <p className="terminal-note">Kaggle uses the running notebook’s two-way Cloudflare WebSocket bridge. The local model connector stays available separately.</p>
          {["kaggle", "local"].map((provider) => (
            <section className="terminal-connection-card" key={provider}>
              <div className="terminal-connection-head"><strong>{provider === "kaggle" ? "Kaggle notebook bridge" : "Local model"}</strong><span className={"terminal-connection-status " + (provider === "kaggle" ? kaggleStatus : connectionStates[provider])}>{(provider === "kaggle" ? kaggleStatus : connectionStates[provider]) === "connected" ? "Connected" : (provider === "kaggle" ? kaggleStatus : connectionStates[provider]) === "checking" ? "Connecting…" : (provider === "kaggle" ? kaggleStatus : connectionStates[provider]) === "error" ? "Offline" : "Not connected"}</span></div>
              <label className="terminal-field-label" htmlFor={"endpoint-" + provider}>{provider === "kaggle" ? "Cloudflare tunnel URL" : "Endpoint URL"}</label>
              <input id={"endpoint-" + provider} value={connections[provider]?.endpoint || ""} onChange={(event) => onConnectionChange(provider, "endpoint", event.target.value)} placeholder={provider === "kaggle" ? "https://your-tunnel.trycloudflare.com" : "http://127.0.0.1:11434"} spellCheck="false" />
              {provider === "local" && <>
                <label className="terminal-field-label" htmlFor="token-local">Bearer token <span>optional · session only</span></label>
                <input id="token-local" type="password" value={connections.local?.token || ""} onChange={(event) => onConnectionChange("local", "token", event.target.value)} placeholder="Paste token for this session" autoComplete="new-password" />
              </>}
              <button className="terminal-test-button" onClick={() => onTest(provider)} disabled={(provider === "kaggle" ? kaggleStatus : connectionStates[provider]) === "checking"}><Play size={13} weight="fill" />{provider === "kaggle" ? (kaggleStatus === "connected" ? "Disconnect bridge" : "Connect bridge") : "Test endpoint"}</button>
              {provider === "kaggle" && kaggleTelemetry?.gpuName && <small>{kaggleTelemetry.gpuName} · {kaggleTelemetry.vramFree || "VRAM unknown"} free{Number.isFinite(kaggleTelemetry.ping) ? ` · ${kaggleTelemetry.ping} ms` : ""}</small>}
              <small>{provider === "kaggle" ? "Open the saved notebook and start its bridge cell first. Connects over wss://…/ws." : "Uses Ollama /api/tags. Allow this site in OLLAMA_ORIGINS when connecting from dabcloud.in."}</small>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function NodeInspector({ node, taskCode, onClose, onProviderChange, onInstructionChange, onCharacterNameChange, onCharacterAdd, onCharacterPhotoUpload, onCharacterPhotoRemove, onEnvironmentDescriptionChange, onEnvironmentPhotoUpload, onEnvironmentPhotoRemove, onKaggleRun, onKaggleConnect, kaggleStatus, kaggleRunStatus, outputFiles, onSaveOutput, outputFolderName }) {
  if (!node) return null;
  const data = node.data;
  const photoCount = (data.characters || []).reduce((total, character) => total + Object.values(character.photos || {}).filter(Boolean).length, 0);
  const kaggleBusy = ["starting", "running"].includes(String(kaggleRunStatus || "").toLowerCase());
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

      {!(["kaggle", "output"].includes(data.kind)) && <>
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
      </>}

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
          <div className="field-hint">Reference images are saved with this workflow and included in the Kaggle graph submission.</div>
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
          <div className="field-hint">Reference images are saved with this workflow and included in the Kaggle graph submission.</div>
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
          <label className="field-label">Output folder on this computer</label>
          <div className="inspector-row"><span>Selected folder</span><strong>{outputFolderName || "Choose an output folder"}</strong></div>
          <div className="field-hint">Choose your D: drive root. DabCloud creates SCENES and a task-code folder inside it before saving.</div>
          {outputFiles?.length ? <div className="output-file-list">
            {outputFiles.map((file) => <div className="output-file-row" key={file.fileName}>
              <FileText size={15} />
              <span>{file.fileName}</span>
              <button className="terminal-test-button" onClick={() => onSaveOutput(file)}>{outputFolderName ? "Save to folder" : "Choose folder & save"}</button>
            </div>)}
          </div> : <p className="terminal-note">Completed Kaggle outputs will appear here with a Save button.</p>}
        </section>
      )}

      {data.kind === "kaggle" && (
        <section className="panel-section">
          <label className="field-label">Saved Kaggle notebook</label>
          <a className="kaggle-notebook-card" href={data.notebookUrl || "https://www.kaggle.com/code/sara8877/dabcloudbp-dual-gpu-30s-video-engine"} target="_blank" rel="noreferrer">
            <HardDrives size={17} /><span><strong>{data.notebookSlug || "sara8877/dabcloudbp-dual-gpu-30s-video-engine"}</strong><small>Open notebook in Kaggle ↗</small></span>
          </a>
          <div className="inspector-row"><span>Bridge</span><strong>{kaggleStatus === "connected" ? "Connected" : "Offline"}</strong></div>
          <div className="field-hint">Open the saved notebook and start its bridge cell. The app connects to that live GPU session and sends this workflow.</div>
          <button className="primary-button dialog-action" onClick={() => onKaggleRun(node.id)} disabled={kaggleBusy}>
            <Play size={14} weight="fill" /> {kaggleRunStatus === "starting" ? "Sending graph…" : kaggleRunStatus === "running" ? "Kaggle is running…" : `Run Kaggle with #${taskCode}`}
          </button>
          <div className="inspector-row"><span>Run status</span><strong>{kaggleRunStatus || "Idle"}</strong></div>
          <button className="terminal-test-button" onClick={() => onKaggleConnect()}>{kaggleStatus === "connected" ? "Disconnect from bridge" : "Connect to bridge"}</button>
        </section>
      )}

      <div className="inspector-footer"><span className={"status-dot " + (data.status === "done" ? "done" : "unconfigured")} /> {data.status === "done" ? "Completed" : "Waiting for connection"}</div>
    </aside>
  );
}

function NodeNavigator({ nodes, taskCode, onSelect, onAdd, addOpen, onToggleAdd, runHistory, workflowVersions, onRestoreVersion }) {
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
      <section className="run-history-section" aria-label="Recent runs">
        <div className="section-title"><span>Recent runs</span><small>{runHistory.length}</small></div>
        {runHistory.length === 0 ? <p className="field-hint">Runs for this task will appear here.</p> : runHistory.slice(0, 5).map((run) => (
          <div className="run-history-row" key={run.runId}>
            <span className={`history-status ${run.status}`} />
            <span><strong>#{run.taskCode} · {run.provider}</strong><small>{run.status} · {new Date(run.startedAt).toLocaleString()}</small></span>
          </div>
        ))}
      </section>
      <section className="run-history-section" aria-label="Saved workflow versions">
        <div className="section-title"><span>Saved versions</span><small>{workflowVersions.length}</small></div>
        {workflowVersions.length === 0 ? <p className="field-hint">Click Save to create a restore point.</p> : workflowVersions.slice(0, 5).map((version) => (
          <div className="version-row" key={version.id}>
            <span><strong>{version.version_name || "Saved version"}</strong><small>{new Date(version.created_at).toLocaleString()}</small></span>
            <button onClick={() => onRestoreVersion(version)}>Restore</button>
          </div>
        ))}
      </section>
    </aside>
  );
}

function OutputDialog({ open, onClose, taskCode, outputData, outputFiles = [], onSaveOutput, outputSaving }) {
  if (!open) return null;
  const files = outputFiles.length ? outputFiles : (Array.isArray(outputData?.files) ? outputData.files : []);
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="output-dialog" role="dialog" aria-modal="true" aria-labelledby="output-title" onClick={(event) => event.stopPropagation()}>
        <button className="icon-button dialog-close" onClick={onClose} aria-label="Close output"><X size={18} /></button>
        <div className="dialog-icon"><FolderOpen size={22} weight="duotone" /></div>
        <span className="inspector-eyebrow">TASK OUTPUT</span>
        <h2 id="output-title">SCENES\{taskCode}</h2>
        <p>{outputFiles.length ? "Read-only Kaggle results. Save a file to the local SCENES task folder." : outputData?.message || "No Kaggle output has been returned for this task yet."}</p>
        {files.map((file, index) => (
          <div className="file-row" key={file.id || file.path || file.url || index}>
            <FileText size={18} />
            <span>{file.fileName || file.name || file.path || "Output file"}</span>
            {file.url && <a href={file.url} target="_blank" rel="noreferrer">Open</a>}
            {file.url && <button className="terminal-test-button" onClick={() => onSaveOutput(file)} disabled={Boolean(outputSaving)}>{outputSaving === file.fileName ? "Saving…" : "Save to SCENES folder"}</button>}
          </div>
        ))}
        {outputData?.outputPath && <div className="file-row"><FolderOpen size={18} /><span>{outputData.outputPath}</span></div>}
        <button className="primary-button dialog-action" onClick={onClose}>Close</button>
      </section>
    </div>
  );
}

function Workspace({ user, onSignOut }) {
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
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalTab, setTerminalTab] = useState("terminal");
  const [terminalCommandText, setTerminalCommandText] = useState("");
  const [terminalLines, setTerminalLines] = useState([
    { kind: "system", prompt: false, text: "DabCloud pipeline console · type help for commands." },
    { kind: "system", prompt: false, text: "Configure Kaggle or local inference endpoints in the Connections tab." },
  ]);
  const [connections, setConnections] = useState({
    kaggle: { endpoint: "", token: "" },
    local: { endpoint: "", token: "" },
  });
  const [connectionStates, setConnectionStates] = useState({ kaggle: "unconfigured", local: "unconfigured" });
  const [kaggleStatus, setKaggleStatus] = useState("unconfigured");
  const [kaggleTelemetry, setKaggleTelemetry] = useState({});
  const [kaggleRunStatus, setKaggleRunStatus] = useState("Idle");
  const [kaggleOutputFiles, setKaggleOutputFiles] = useState([]);
  const [outputRootHandle, setOutputRootHandle] = useState(null);
  const [outputSaving, setOutputSaving] = useState("");
  const kaggleSocketRef = useRef(null);
  const kagglePingRef = useRef(null);
  const activeKaggleRunRef = useRef(false);
  const [workflowLoaded, setWorkflowLoaded] = useState(false);
  const [workflowLoadError, setWorkflowLoadError] = useState(false);
  const [readyTaskCode, setReadyTaskCode] = useState(null);
  const [loadingTaskCode, setLoadingTaskCode] = useState(false);
  const [saveState, setSaveState] = useState("loading");
  const [runKind, setRunKind] = useState("info");
  const [workflowVersions, setWorkflowVersions] = useState([]);
  const [runHistory, setRunHistory] = useState(() => {
    try { const stored = JSON.parse(localStorage.getItem(`studio-runs:${user.id}`) || "[]"); return Array.isArray(stored) ? stored : []; } catch { return []; }
  });
  const activeRunRef = useRef(null);

  useEffect(() => {
    if (!readyTaskCode || workflowLoadError) return undefined;
    let active = true;
    (async () => {
      const [versionsResult, runsResult] = await Promise.all([
        supabase.from("studio_workflow_versions").select("id, version_name, graph, created_at")
          .eq("user_id", user.id).eq("task_code", readyTaskCode).order("created_at", { ascending: false }).limit(10),
        supabase.from("studio_runs").select("run_id, task_code, provider, status, message, started_at")
          .eq("user_id", user.id).eq("task_code", readyTaskCode).order("started_at", { ascending: false }).limit(10),
      ]);
      if (!active) return;
      if (!versionsResult.error) setWorkflowVersions(versionsResult.data || []);
      if (!runsResult.error) setRunHistory((current) => {
        const otherTasks = (Array.isArray(current) ? current : []).filter((run) => run.taskCode !== readyTaskCode);
        const loaded = (runsResult.data || []).map((run) => ({ runId: run.run_id, taskCode: run.task_code, provider: run.provider, status: run.status, message: run.message, startedAt: run.started_at }));
        const next = [...loaded, ...otherTasks].slice(0, 30);
        try { localStorage.setItem(`studio-runs:${user.id}`, JSON.stringify(next)); } catch {}
        return next;
      });
    })().catch(() => {});
    return () => { active = false; };
  }, [readyTaskCode, workflowLoadError, user.id]);

  useEffect(() => {
    try {
      const savedBridgeUrl = localStorage.getItem("dabcloud_kaggle_tunnel_url");
      if (savedBridgeUrl) setConnections((current) => ({ ...current, kaggle: { ...current.kaggle, endpoint: current.kaggle.endpoint || savedBridgeUrl } }));
    } catch {}
  }, []);

  useEffect(() => () => {
    if (kagglePingRef.current) window.clearInterval(kagglePingRef.current);
    if (kaggleSocketRef.current) kaggleSocketRef.current.close(1000, "Studio closed");
  }, []);

  useEffect(() => {
    let active = true;
    async function loadWorkflow() {
      let data;
      let error;
      try {
        ({ data, error } = await supabase
          .from("studio_workflows")
          .select("graph, task_code")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle());
      } catch (loadError) { error = loadError; }
      if (!active) return;
      if (error) {
        setWorkflowLoadError(true);
        setSaveState("error");
        setRunKind("error");
        setRunMessage("Saved workflow could not be loaded. Autosave is paused to protect your existing work. Reload after checking your connection.");
      } else if (data?.graph) {
        if (Array.isArray(data.graph.nodes) && data.graph.nodes.length) setNodes(data.graph.nodes);
        if (Array.isArray(data.graph.edges)) setEdges(data.graph.edges);
        if (data.graph.connections) {
          setConnections((current) => ({
            ...current,
            kaggle: { ...current.kaggle, endpoint: data.graph.connections.kaggle?.endpoint || "" },
            local: { ...current.local, endpoint: data.graph.connections.local?.endpoint || "" },
          }));
        }
        setTaskCode(data.task_code || "565349");
        setReadyTaskCode(data.task_code || "565349");
      } else {
        setReadyTaskCode("565349");
      }
      setWorkflowLoaded(!error);
      setSaveState(error ? "error" : "saved");
    }
    loadWorkflow();
    return () => { active = false; };
  }, [user.id]);

  useEffect(() => {
    const code = validateTaskCode(taskCode);
    if (!workflowLoaded || workflowLoadError || !code.valid || code.code === readyTaskCode) return undefined;
    let active = true;
    setLoadingTaskCode(true);
    setSaveState("loading");
    (async () => {
      try {
        const { data, error } = await supabase.from("studio_workflows")
          .select("graph, task_code")
          .eq("user_id", user.id)
          .eq("task_code", code.code)
          .maybeSingle();
        if (!active) return;
        if (error) throw error;
        setNodes(Array.isArray(data?.graph?.nodes) && data.graph.nodes.length ? data.graph.nodes : initialNodes);
        setEdges(Array.isArray(data?.graph?.edges) ? data.graph.edges : initialEdges);
        setConnections((current) => ({
          ...current,
          kaggle: { ...current.kaggle, endpoint: data?.graph?.connections?.kaggle?.endpoint || "" },
          local: { ...current.local, endpoint: data?.graph?.connections?.local?.endpoint || "" },
        }));
        setSelectedNodeId(null);
        setReadyTaskCode(code.code);
        setSaveState(data ? "saved" : "saving");
        setLoadingTaskCode(false);
      } catch (error) {
        if (!active) return;
        setLoadingTaskCode(false); setWorkflowLoadError(true); setSaveState("error"); setRunKind("error");
        setRunMessage(`Could not load task #${code.code}; autosave is paused to protect existing work. ${error.message || ""}`);
      }
    })();
    return () => { active = false; };
  }, [workflowLoaded, workflowLoadError, taskCode, readyTaskCode, user.id]);

  const persistWorkflow = useCallback(async ({ announce = false } = {}) => {
    if (!workflowLoaded || workflowLoadError || loadingTaskCode) {
      setSaveState("error");
      if (announce) setRunMessage("Workflow is not loaded, so saving is paused to protect existing work.");
      return false;
    }
    const codeResult = validateTaskCode(taskCode);
    if (!codeResult.valid) {
      setSaveState("error");
      if (announce) setRunMessage(codeResult.message);
      return false;
    }
    const code = codeResult.code;
    if (code !== readyTaskCode) {
      setSaveState("loading");
      if (announce) setRunMessage(`Loading task #${code} before saving…`);
      return false;
    }
    setSaveState("saving");
    const graph = {
      nodes,
      edges,
      connections: {
        kaggle: { endpoint: connections.kaggle?.endpoint || "" },
        local: { endpoint: connections.local?.endpoint || "" },
      },
    };
    let error;
    try { ({ error } = await supabase.from("studio_workflows").upsert({
      user_id: user.id,
      task_code: code,
      name: `Movie workflow #${code}`,
      graph,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,task_code" })); } catch (saveError) { error = saveError; }
    setSaveState(error ? "error" : "saved");
    if (error) {
        setRunKind("error");
      setRunMessage("Workflow save failed: " + error.message);
      setTerminalLines((current) => [...current, { kind: "error", prompt: false, text: "Save failed: " + error.message }]);
      return false;
    }
    if (announce) {
      let versionError;
      try {
        const result = await supabase.from("studio_workflow_versions").insert({
          user_id: user.id, task_code: code, version_name: `Saved ${new Date().toLocaleString()}`, graph,
        }).select("id, version_name, graph, created_at").single();
        versionError = result.error;
        if (!versionError) {
          setWorkflowVersions((current) => [result.data, ...current].slice(0, 10));
          const { data: oldVersions } = await supabase.from("studio_workflow_versions").select("id")
            .eq("user_id", user.id).eq("task_code", code).order("created_at", { ascending: false }).range(10, 1000);
          if (oldVersions?.length) await supabase.from("studio_workflow_versions").delete().in("id", oldVersions.map((item) => item.id));
        }
      } catch (error) { versionError = error; }
      setRunKind(versionError ? "warning" : "success");
      setRunMessage(versionError ? `Workflow #${code} saved, but its restore point failed: ${versionError.message}` : `Workflow #${code} saved with a restore point.`);
      setTerminalLines((current) => [...current, { kind: versionError ? "error" : "success", prompt: false, text: versionError ? `Saved #${code}, but version history failed: ${versionError.message}` : `Workflow #${code} saved with a restore point.` }]);
    }
    return true;
  }, [user.id, taskCode, nodes, edges, connections.kaggle?.endpoint, connections.local?.endpoint, workflowLoaded, workflowLoadError, loadingTaskCode, readyTaskCode]);

  useEffect(() => {
    if (!workflowLoaded || workflowLoadError || loadingTaskCode) return undefined;
    const code = validateTaskCode(taskCode);
    if (!code.valid || code.code !== readyTaskCode) return undefined;
    const timer = window.setTimeout(async () => {
      await persistWorkflow();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [workflowLoaded, workflowLoadError, loadingTaskCode, readyTaskCode, taskCode, persistWorkflow]);

  const pushTerminal = useCallback((kind, text, prompt = false) => {
    setTerminalLines((current) => [...current.slice(-79), { kind, text, prompt }]);
  }, []);

  const saveRunRecord = useCallback(async (entry) => {
    if (!entry) return;
    const normalized = { ...entry, startedAt: entry.startedAt || new Date().toISOString() };
    setRunHistory((current) => {
      const next = [normalized, ...(Array.isArray(current) ? current.filter((item) => item.runId !== normalized.runId) : [])].slice(0, 30);
      try { localStorage.setItem(`studio-runs:${user.id}`, JSON.stringify(next)); } catch {}
      return next;
    });
    try {
      const { error } = await supabase.from("studio_runs").upsert({
        run_id: normalized.runId, user_id: user.id, task_code: normalized.taskCode,
        provider: normalized.provider, status: normalized.status, message: normalized.message || "",
        started_at: normalized.startedAt, updated_at: new Date().toISOString(),
      });
      if (error) pushTerminal("error", `Run history save failed: ${error.message}`);
    } catch (error) { pushTerminal("error", `Run history save failed: ${error.message}`); }
  }, [user.id, pushTerminal]);

  const changeConnection = useCallback((provider, field, value) => {
    if (provider === "kaggle" && field === "endpoint" && value !== connections.kaggle?.endpoint) {
      if (kagglePingRef.current) window.clearInterval(kagglePingRef.current);
      kagglePingRef.current = null;
      if (kaggleSocketRef.current) kaggleSocketRef.current.close(1000, "Bridge URL changed");
      kaggleSocketRef.current = null;
      setKaggleStatus("unconfigured");
    }
    setConnections((current) => ({ ...current, [provider]: { ...current[provider], [field]: value } }));
    if (field === "endpoint") setConnectionStates((current) => ({ ...current, [provider]: "unconfigured" }));
  }, [connections.kaggle?.endpoint]);

  const handleKaggleMessage = useCallback((message) => {
    if (message.type === "HANDSHAKE") {
      const telemetry = message.telemetry || {};
      setKaggleTelemetry((current) => ({ ...current, ...telemetry }));
      setKaggleStatus("connected");
      setConnectionStates((current) => ({ ...current, kaggle: "connected" }));
      pushTerminal("success", `Kaggle bridge online${telemetry.gpuName ? ` · ${telemetry.gpuName}` : ""}${telemetry.vramFree ? ` · ${telemetry.vramFree} VRAM free` : ""}.`);
    } else if (message.type === "PONG" && message.t) {
      setKaggleTelemetry((current) => ({ ...current, ping: Date.now() - message.t }));
    } else if (message.type === "LOG") {
      pushTerminal(message.level === "ERROR" ? "error" : message.level === "SUCCESS" ? "success" : "system", message.text || "Kaggle log message.");
    } else if (message.type === "UPDATE_NODE") {
      const updates = message.updates || {};
      const files = normalizeKaggleOutputFiles(updates);
      if (files.length) setKaggleOutputFiles((current) => [...current.filter((item) => !files.some((file) => file.fileName === item.fileName)), ...files]);
      if (updates.outputUrl || updates.videoUrl || updates.fileUrl) {
        const extra = normalizeKaggleOutputFiles({ files: [{ ...updates, fileName: updates.fileName || "final-video.mp4" }] });
        if (extra.length) setKaggleOutputFiles((current) => [...current.filter((item) => !extra.some((file) => file.fileName === item.fileName)), ...extra]);
      }
      setNodes((current) => current.map((node) => {
        if (node.id !== message.nodeId && node.data.kind !== "output") return node;
        if (node.data.kind === "output") return { ...node, data: { ...node.data, status: updates.status === "error" ? "paused" : "done" } };
        return { ...node, data: { ...node.data, status: updates.status || node.data.status } };
      }));
    } else if (message.type === "SPAWN_NODE") {
      const files = normalizeKaggleOutputFiles(message.props || {});
      if (files.length) setKaggleOutputFiles((current) => [...current.filter((item) => !files.some((file) => file.fileName === item.fileName)), ...files]);
      if (message.nodeType === "model_output" || files.length) pushTerminal("success", `Kaggle returned output${files.length ? ` · ${files.map((file) => file.fileName).join(", ")}` : " metadata"}.`);
    } else if (["OUTPUT_FILE", "VIDEO_READY", "OUTPUT_READY"].includes(message.type)) {
      const files = normalizeKaggleOutputFiles(message);
      if (files.length) setKaggleOutputFiles((current) => [...current.filter((item) => !files.some((file) => file.fileName === item.fileName)), ...files]);
      pushTerminal("success", files.length ? `Kaggle returned ${files.length} output file${files.length === 1 ? "" : "s"}.` : message.text || "Kaggle returned an output.");
    } else if (message.type === "JOB_FINISHED") {
      const files = normalizeKaggleOutputFiles(message);
      if (files.length) setKaggleOutputFiles((current) => [...current.filter((item) => !files.some((file) => file.fileName === item.fileName)), ...files]);
      setKaggleRunStatus("Completed");
      activeKaggleRunRef.current = false;
      setRunKind("success");
      if (activeRunRef.current) saveRunRecord({ ...activeRunRef.current, status: "completed", message: message.summary || "Kaggle run completed." });
      activeRunRef.current = null;
      setRunning(false);
      setNodes((current) => current.map((node) => node.data.kind === "kaggle" || node.data.kind === "output"
        ? { ...node, data: { ...node.data, status: "done" } }
        : node));
      setRunMessage(message.summary || `Kaggle finished task #${message.activeCode || taskCode}.`);
      pushTerminal("success", message.summary || `Kaggle finished task #${message.activeCode || taskCode}.`);
    } else if (message.type === "JOB_FAILED" || message.type === "ERROR") {
      setKaggleRunStatus("Failed");
      activeKaggleRunRef.current = false;
      setRunKind("error");
      if (activeRunRef.current) saveRunRecord({ ...activeRunRef.current, status: "failed", message: message.message || message.error || "Kaggle run failed." });
      activeRunRef.current = null;
      setRunning(false);
      setNodes((current) => current.map((node) => node.data.kind === "kaggle" ? { ...node, data: { ...node.data, status: "paused" } } : node));
      setRunMessage(message.message || message.error || "Kaggle reported a run error.");
      pushTerminal("error", message.message || message.error || "Kaggle reported a run error.");
    }
  }, [pushTerminal, taskCode, saveRunRecord]);

  const connectKaggleBridge = useCallback((endpointOverride) => {
    const endpoint = String(typeof endpointOverride === "string" ? endpointOverride : connections.kaggle?.endpoint || "").trim();
    if (kaggleSocketRef.current?.readyState === WebSocket.OPEN) {
      kaggleSocketRef.current.close(1000, "User disconnected");
      kaggleSocketRef.current = null;
      if (kagglePingRef.current) window.clearInterval(kagglePingRef.current);
      setKaggleStatus("unconfigured");
      setConnectionStates((current) => ({ ...current, kaggle: "unconfigured" }));
      pushTerminal("system", "Disconnected from Kaggle bridge.");
      return false;
    }
    if (!endpoint) {
      setKaggleStatus("error");
      pushTerminal("error", "Add the notebook’s Cloudflare tunnel URL in Connections first.");
      setTerminalOpen(true);
      setTerminalTab("connections");
      return false;
    }
    let socketUrl;
    try {
      const parsed = new URL(/^wss?:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`);
      if (parsed.protocol === "http:") parsed.protocol = "ws:";
      if (parsed.protocol === "https:") parsed.protocol = "wss:";
      if (!["wss:", "ws:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("Use a valid Cloudflare tunnel URL without embedded credentials.");
      if (window.location.protocol === "https:" && parsed.protocol !== "wss:") throw new Error("Use the HTTPS Cloudflare tunnel URL so this studio can connect securely over WSS.");
      if (!parsed.pathname.endsWith("/ws")) parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/ws`;
      socketUrl = parsed.toString();
    } catch (error) {
      setKaggleStatus("error");
      pushTerminal("error", error.message || "Enter a valid Kaggle bridge URL.");
      return false;
    }
    try { localStorage.setItem("dabcloud_kaggle_tunnel_url", endpoint); } catch {}
    setKaggleStatus("checking");
    setConnectionStates((current) => ({ ...current, kaggle: "checking" }));
    pushTerminal("system", `Connecting to Kaggle bridge ${socketUrl}…`);
    let socket;
    try { socket = new WebSocket(socketUrl); }
    catch (error) {
      setKaggleStatus("error");
      pushTerminal("error", `Could not open Kaggle bridge: ${error.message}`);
      return false;
    }
    kaggleSocketRef.current = socket;
    socket.onopen = () => {
      setKaggleStatus("connected");
      setConnectionStates((current) => ({ ...current, kaggle: "connected" }));
      pushTerminal("success", "Kaggle bridge connected. Waiting for GPU handshake…");
      if (kagglePingRef.current) window.clearInterval(kagglePingRef.current);
      kagglePingRef.current = window.setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "PING", t: Date.now() }));
      }, 15000);
    };
    socket.onmessage = (event) => {
      try { handleKaggleMessage(JSON.parse(event.data)); }
      catch { pushTerminal("system", String(event.data).slice(0, 1200)); }
    };
    socket.onerror = () => {
      setKaggleStatus("error");
      setConnectionStates((current) => ({ ...current, kaggle: "error" }));
      pushTerminal("error", "Kaggle bridge connection failed. Check that the notebook session and Cloudflare tunnel are running.");
    };
    socket.onclose = (event) => {
      if (kagglePingRef.current) window.clearInterval(kagglePingRef.current);
      kagglePingRef.current = null;
      if (kaggleSocketRef.current === socket) kaggleSocketRef.current = null;
      const state = event.code === 1000 ? "unconfigured" : "error";
      setKaggleStatus(state);
      setConnectionStates((current) => ({ ...current, kaggle: state }));
      if (activeKaggleRunRef.current) {
        activeKaggleRunRef.current = false;
        if (activeRunRef.current) saveRunRecord({ ...activeRunRef.current, status: "failed", message: "Kaggle bridge disconnected during an active run." });
        activeRunRef.current = null;
        setRunning(false);
        setKaggleRunStatus("Failed");
        setNodes((current) => current.map((node) => ["kaggle", "output", "video"].includes(node.data.kind) && node.data.status === "running"
          ? { ...node, data: { ...node.data, status: "paused" } } : node));
        setRunKind("error");
        setRunMessage("Kaggle bridge closed before the run finished. Reconnect and check the notebook before retrying.");
        pushTerminal("error", "Kaggle bridge disconnected during an active run.");
      }
    };
    return true;
  }, [connections.kaggle?.endpoint, handleKaggleMessage, pushTerminal, saveRunRecord]);

  const testConnection = useCallback(async (provider, endpointOverride) => {
    if (provider === "kaggle") return connectKaggleBridge(endpointOverride);
    const connection = connections[provider];
    const endpoint = String(endpointOverride || connection?.endpoint || "").trim().replace(/\/+$/, "");
    if (!endpoint) {
      setConnectionStates((current) => ({ ...current, [provider]: "error" }));
      pushTerminal("error", `No ${provider} endpoint is configured. Add one in Connections first.`);
      return;
    }
    let url;
    try {
      url = new URL(endpoint);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error("Use a valid HTTP(S) endpoint. Keep credentials out of the URL.");
    } catch (error) {
      setConnectionStates((current) => ({ ...current, [provider]: "error" }));
      pushTerminal("error", error.message || "Enter a valid HTTP(S) endpoint.");
      return;
    }
    const route = provider === "kaggle"
      ? `${endpoint.replace(/\/v1$/i, "")}/v1/models`
      : `${endpoint.replace(/\/api$/i, "")}/api/tags`;
    setConnectionStates((current) => ({ ...current, [provider]: "checking" }));
    pushTerminal("system", `Checking ${provider} endpoint ${route}…`);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(route, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(connection?.token ? { Authorization: `Bearer ${connection.token}` } : {}),
        },
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || payload.message || `Endpoint responded with HTTP ${response.status}.`);
      const models = provider === "kaggle"
        ? (payload.data || payload.models || []).map((item) => item.id || item.name).filter(Boolean)
        : (payload.models || []).map((item) => item.name).filter(Boolean);
      setConnectionStates((current) => ({ ...current, [provider]: "connected" }));
      pushTerminal("success", `${provider} endpoint connected${models.length ? ` · ${models.length} model${models.length === 1 ? "" : "s"} found` : ""}.`);
      if (models.length) pushTerminal("system", models.slice(0, 12).join("  ·  "));
      return true;
    } catch (error) {
      setConnectionStates((current) => ({ ...current, [provider]: "error" }));
      const message = error.name === "AbortError" ? "Endpoint check timed out after 12 seconds." : error instanceof TypeError ? "Could not reach endpoint. Check its URL and CORS settings." : error.message;
      pushTerminal("error", `${provider} check failed: ${message}`);
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  }, [connections, connectKaggleBridge, pushTerminal]);

  const connectionState = {
    Cloud: "unconfigured",
    Kaggle: kaggleStatus,
    Local: connectionStates.local,
  };


  const runWorkflow = useCallback(async () => {
    if (running) return;
    const codeResult = validateTaskCode(taskCode);
    if (!codeResult.valid) {
      setRunKind("error"); setRunMessage(codeResult.message);
      return;
    }
    const code = codeResult.code;
    if (code !== readyTaskCode || loadingTaskCode) {
      setRunKind("info"); setRunMessage(`Loading the saved workflow for task #${code}…`); return;
    }
    const graphIssues = validateWorkflow(nodes, edges, taskCode);
    if (graphIssues.length) {
      setRunKind("error"); setRunMessage("Workflow needs attention: " + graphIssues.join(" "));
      pushTerminal("error", `Run blocked: ${graphIssues.join(" ")}`);
      return;
    }
    const videoProvider = nodes.find((node) => node.data.kind === "video")?.data.provider || "Kaggle";
    if (videoProvider !== "Kaggle") {
      setRunKind("error");
      setRunMessage(`${videoProvider} generation is not wired to this workflow yet. Select Kaggle for the connected notebook bridge.`);
      return;
    }
    const socket = kaggleSocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setRunKind("error");
      setRunMessage("Connect the running Kaggle notebook bridge first.");
      setTerminalOpen(true);
      setTerminalTab("connections");
      pushTerminal("error", "Run stopped: connect the Kaggle bridge before dispatching this graph.");
      return;
    }
    const configuredNotebook = nodes.find((node) => node.data.kind === "kaggle")?.data.notebookSlug || "sara8877/dabcloudbp-dual-gpu-30s-video-engine";
    let taskRecord;
    try {
      setRunMessage(`Loading approved task #${code} from the task API…`);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your sign-in session expired. Sign in again.");
      const taskResponse = await fetch(`/api/tasks/${code}`, { headers: { Accept: "application/json", Authorization: `Bearer ${session.access_token}` } });
      taskRecord = await taskResponse.json().catch(() => ({}));
      if (!taskResponse.ok || taskRecord.success === false) throw new Error(taskRecord.error || taskRecord.message || `Task API returned HTTP ${taskResponse.status}.`);
    } catch (error) {
      setRunKind("error"); setRunMessage(`Could not load task #${code}: ${error.message}`);
      pushTerminal("error", `Run stopped: task #${code} could not be loaded.`);
      return;
    }
    const saved = await persistWorkflow();
    if (!saved) return;
    const nodeTypesByKind = { start: "entry_code", brief: "doc_note", cast: "photo_profile", environment: "environment", storyboard: "prompt_spec", video: "video_asset", kaggle: "kaggle_trigger", output: "model_output", check: "continuity_check" };
    const activeNodes = nodes.map((node) => ({
      ...node.data,
      ...node,
      id: node.id,
      type: nodeTypesByKind[node.data.kind] || node.data.kind,
      kind: node.data.kind,
      title: node.data.title,
      x: node.position.x,
      y: node.position.y,
      position: node.position,
      code: node.data.kind === "start" ? code : node.data.code,
      taskCode: code,
      notebookSlug: node.data.kind === "kaggle" ? configuredNotebook : node.data.notebookSlug,
      notes: node.data.instructions,
      data: node.data,
    }));
    const activeWires = edges.map((edge) => ({
      ...edge,
      fromNode: edge.source,
      fromPort: edge.sourceHandle || "out",
      toNode: edge.target,
      toPort: edge.targetHandle || "in",
      label: edge.source === "start" ? `#${code}` : "WIRED",
    }));
    try {
      const runId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      activeRunRef.current = { runId, taskCode: code, provider: "Kaggle", startedAt: new Date().toISOString() };
      await saveRunRecord({ ...activeRunRef.current, status: "running", message: "Sent to Kaggle notebook." });
      const executionPayload = { type: "EXECUTE_GRAPH", runId, activeCode: code, taskCode: code, task: taskRecord, notebookSlug: configuredNotebook, nodes: activeNodes, wires: activeWires, edges, timestamp: Date.now() };
      if (new Blob([JSON.stringify(executionPayload)]).size > 4_000_000) throw new Error("Task, graph, and reference images exceed the 4 MB submission limit. Reduce the number of attached images.");
      socket.send(JSON.stringify(executionPayload));
      activeKaggleRunRef.current = true;
      setRunning(true);
      setRunKind("info");
      setOutputData(null);
      setKaggleOutputFiles([]);
      setKaggleRunStatus("Running");
      setRunMessage(`Workflow #${code} sent to Kaggle · waiting for notebook output…`);
      setNodes((current) => current.map((node) => node.data.kind === "video" || node.data.kind === "kaggle" || node.data.kind === "output"
        ? { ...node, data: { ...node.data, status: "running" } }
        : node));
      pushTerminal("success", `Sent ${activeNodes.length} nodes and ${activeWires.length} connections for task #${code} to ${configuredNotebook}.`);
    } catch (error) {
      activeKaggleRunRef.current = false;
      if (activeRunRef.current) saveRunRecord({ ...activeRunRef.current, status: "failed", message: error.message });
      activeRunRef.current = null;
      setRunning(false);
      setKaggleRunStatus("Failed");
      setRunKind("error");
      setRunMessage(`Kaggle dispatch failed: ${error.message}`);
      pushTerminal("error", `Kaggle dispatch failed: ${error.message}`);
    }
  }, [taskCode, nodes, edges, persistWorkflow, pushTerminal, running, readyTaskCode, loadingTaskCode, saveRunRecord]);

  const executeTerminalCommand = useCallback(async (event) => {
    event.preventDefault();
    const raw = terminalCommandText.trim();
    if (!raw) return;
    pushTerminal("command", raw, true);
    setTerminalCommandText("");
    const [verbRaw, ...args] = raw.split(/\s+/);
    const verb = verbRaw.toLowerCase();
    const provider = args[0]?.toLowerCase();
    if (verb === "help") {
      pushTerminal("system", "connect kaggle <cloudflare-url> · test kaggle · connect local <ollama-url> · test local · models local · status · save · run · clear");
    } else if (verb === "clear") {
      setTerminalLines([]);
    } else if (verb === "status") {
      pushTerminal("system", `Task #${taskCode.replace(/\D/g, "").slice(0, 6)} · save ${saveState} · Kaggle bridge ${kaggleStatus} · run ${kaggleRunStatus} · Local ${connectionStates.local}`);
      pushTerminal("system", "Kaggle uses the saved notebook’s live WebSocket bridge for graph dispatch, GPU handshake, logs, node updates, and completion messages.");
    } else if (verb === "connect" && ["kaggle", "local"].includes(provider) && args[1]) {
      const endpoint = args.slice(1).join(" ");
      changeConnection(provider, "endpoint", endpoint);
      pushTerminal("system", `${provider} endpoint saved to this workflow. Testing connection…`);
      window.setTimeout(() => testConnection(provider, endpoint), 0);
    } else if (verb === "test" && provider === "all") {
      await Promise.all([testConnection("kaggle"), testConnection("local")]);
    } else if (verb === "test" && ["kaggle", "local"].includes(provider)) {
      await testConnection(provider);
    } else if (verb === "models" && ["kaggle", "local"].includes(provider)) {
      if (provider === "local") await testConnection(provider);
      else pushTerminal("system", "Kaggle runs the configured notebook through its live bridge; it does not expose an OpenAI model list here.");
    } else if (verb === "save") {
      await persistWorkflow({ announce: true });
    } else if (verb === "run") {
      pushTerminal("system", "Dispatching the connected workflow to the Kaggle notebook bridge.");
      runWorkflow();
    } else {
      pushTerminal("error", "Unknown command. Type help to see the available commands.");
    }
  }, [terminalCommandText, taskCode, saveState, connectionStates, kaggleStatus, kaggleRunStatus, changeConnection, testConnection, persistWorkflow, runWorkflow, pushTerminal]);

  const saveKaggleOutput = useCallback(async (file) => {
    const code = taskCode.replace(/\D/g, "").slice(0, 6);
    if (!/^\d{6}$/.test(code)) {
      setRunMessage("Enter a six-digit task code before saving output.");
      return;
    }
    const safeName = String(file.fileName || "kaggle-output.bin").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
    setOutputSaving(safeName);
    let writable;
    try {
      if (!window.showDirectoryPicker) throw new Error("Folder saving needs Microsoft Edge or Chrome on the secure DabCloud site.");
      const root = outputRootHandle || await window.showDirectoryPicker({ mode: "readwrite" });
      if (!outputRootHandle) setOutputRootHandle(root);
      const scenes = await root.getDirectoryHandle("SCENES", { create: true });
      const taskFolder = await scenes.getDirectoryHandle(code, { create: true });
      let source = file.url || file.downloadUrl || file.outputUrl || file.videoUrl || file.fileUrl;
      if (!source) throw new Error("Kaggle returned a file without a download URL.");
      const response = source.startsWith("data:") ? await fetch(source) : await fetch(source, { credentials: "omit" });
      if (!response.ok) throw new Error(`Output download returned HTTP ${response.status}.`);
      const destination = await taskFolder.getFileHandle(safeName, { create: true });
      writable = await destination.createWritable();
      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writable.write(value);
        }
      } else {
        await writable.write(await response.blob());
      }
      await writable.close();
      const folder = outputRootHandle?.name || root.name || "selected folder";
      setRunKind("success");
      setRunMessage(`Saved ${safeName} under ${folder}\\SCENES\\${code}.`);
      pushTerminal("success", `Saved ${safeName} under ${folder}\\SCENES\\${code}.`);
    } catch (error) {
      try { await writable?.abort(); } catch {}
      const message = error.name === "AbortError" ? "Folder selection was canceled." : error instanceof TypeError ? "The Kaggle download URL blocks browser access. The notebook bridge must return a browser-readable file URL." : error.message;
      setRunKind("error");
      setRunMessage(`Could not save output: ${message}`);
      pushTerminal("error", `Could not save ${safeName}: ${message}`);
    } finally {
      setOutputSaving("");
    }
  }, [outputRootHandle, taskCode, pushTerminal]);

  const displayNodes = useMemo(
    () => nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        details: node.data.details?.map((detail) => detail.replace("565349", taskCode.replace(/\D/g, "").slice(0, 6))),
        taskCode: taskCode.replace(/\D/g, "").slice(0, 6),
        onRun: runWorkflow,
        onKaggleRun: runWorkflow,
        onOpenOutput: () => setDialogOpen(true),
        outputFiles: kaggleOutputFiles,
        running,
      },
    })),
    [nodes, taskCode, runWorkflow, running, kaggleOutputFiles],
  );
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;

  const onNodesChange = useCallback((changes) => setNodes((current) => {
    const protectedIds = new Set(current.filter((node) => ["start", "output"].includes(node.data.kind)).map((node) => node.id));
    return applyNodeChanges(changes.filter((change) => !(change.type === "remove" && protectedIds.has(change.id))), current);
  }), []);
  const onEdgesChange = useCallback((changes) => setEdges((current) => applyEdgeChanges(changes, current)), []);
  const onConnect = useCallback((connection) => setEdges((current) => addEdge({
    ...connection,
    type: "smoothstep",
    style: { stroke: "#aeb5c2", strokeWidth: 1.8 },
  }, current)), []);

  const addNode = useCallback((definition, dropPosition) => {
    if (["start", "output"].includes(definition.kind) && nodes.some((node) => node.data.kind === definition.kind)) {
      setRunKind("warning");
      setRunMessage(`This workflow already has a ${definition.kind === "start" ? "Task Code" : "Final Output"} node.`);
      return;
    }
    const id = definition.kind + "-" + Math.random().toString(36).slice(2, 7);
    const viewport = document.querySelector(".flow-viewport")?.getBoundingClientRect();
    const position = dropPosition || screenToFlowPosition({
      x: (viewport?.left || 0) + (viewport?.width || window.innerWidth) * 0.5,
      y: (viewport?.top || 0) + (viewport?.height || window.innerHeight) * 0.5,
    });
    const Icon = ICONS[definition.kind] || Sparkle;
    const nodeData = {
      ...definition,
      ...(definition.kind === "kaggle" ? { notebookSlug: "sara8877/dabcloudbp-dual-gpu-30s-video-engine", notebookLabel: "DabCloudBP Dual GPU 30s Video Engine", notebookUrl: "https://www.kaggle.com/code/sara8877/dabcloudbp-dual-gpu-30s-video-engine" } : {}),
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
  }, [screenToFlowPosition, nodes]);

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
    Promise.all(files.map(async (file) => ({
      id: (globalThis.crypto?.randomUUID?.() || Date.now() + "-" + Math.random().toString(36).slice(2)),
      name: file.name,
      url: await makePersistentImage(file),
    }))).then((photos) => setNodes((current) => current.map((node) => node.id === nodeId ? {
      ...node,
      data: { ...node.data, referenceImages: [...(node.data.referenceImages || []), ...photos] },
    } : node))).catch((error) => setRunMessage(error.message));
  };

  const removeEnvironmentPhoto = (nodeId, photoId) => {
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
    makePersistentImage(file).then((url) => {
      const photo = {
        id: (globalThis.crypto?.randomUUID?.() || Date.now() + "-" + Math.random().toString(36).slice(2)),
        name: file.name,
        url,
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
    }).catch((error) => setRunMessage(error.message));
  };

  const removeCharacterPhoto = (nodeId, characterId, slotKey) => {
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

  const restoreWorkflowVersion = (version) => {
    if (!Array.isArray(version.graph?.nodes) || !Array.isArray(version.graph?.edges)) {
      setRunKind("error"); setRunMessage("This saved version is incomplete and cannot be restored."); return;
    }
    setNodes(version.graph.nodes); setEdges(version.graph.edges); setSelectedNodeId(null);
    setConnections((current) => ({
      ...current,
      kaggle: { ...current.kaggle, endpoint: version.graph.connections?.kaggle?.endpoint || "" },
      local: { ...current.local, endpoint: version.graph.connections?.local?.endpoint || "" },
    }));
    setRunKind("success"); setRunMessage(`Restored ${version.version_name || "saved workflow version"}.`);
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
              maxLength={20}
              inputMode="numeric"
              onChange={(event) => setTaskCode(event.target.value.replace(/\D/g, ""))}
              onKeyDown={(event) => { if (event.key === "Enter") runWorkflow(); }}
            />
          </label>
          <button className="primary-button top-run" onClick={runWorkflow} disabled={running || loadingTaskCode || saveState === "loading"}>
            <Play size={15} weight="fill" /> {running ? "Sending" : "Run"}
          </button>
        </div>
        <div className="connection-group" aria-label="Model connections">
          <div className="connection-wrap">
            <StatusPill icon={Cloud} name="Cloud" tone="cloud" status={connectionState.Cloud} open={connectionMenu === "Cloud"} onClick={() => setConnectionMenu(connectionMenu === "Cloud" ? "" : "Cloud")} />
            {connectionMenu === "Cloud" && <div className="connection-popover"><strong>Cloud models</strong><span>Not connected · add a provider endpoint and credentials to enable generation.</span></div>}
          </div>
          <div className="connection-wrap">
            <StatusPill icon={HardDrives} name="Kaggle" tone="kaggle" status={kaggleStatus} open={terminalOpen && terminalTab === "connections"} onClick={() => { setTerminalOpen(true); setTerminalTab("connections"); setConnectionMenu(""); }} />
          </div>
          <div className="connection-wrap">
            <StatusPill icon={Monitor} name="Local" tone="local" status={connectionState.Local} open={terminalOpen && terminalTab === "connections"} onClick={() => { setTerminalOpen(true); setTerminalTab("connections"); setConnectionMenu(""); }} />
          </div>
        </div>
        <div className="account-actions">
          <span className={"account-save-state " + saveState} title={saveState === "error" ? "Workflow save failed" : "Workflow autosave status"}>
            <span className={"account-save-dot " + saveState} />{saveState === "saving" ? "Saving" : saveState === "loading" ? "Loading" : saveState === "error" ? "Save issue" : "Saved"}
          </span>
          <button className="account-save-button" onClick={() => persistWorkflow({ announce: true })} disabled={saveState === "saving" || saveState === "loading"}>
            <FloppyDisk size={15} />Save
          </button>
          <button className={"account-terminal-button " + (terminalOpen ? "active" : "")} onClick={() => { setTerminalOpen((open) => !open); setConnectionMenu(""); }} aria-expanded={terminalOpen}>
            <TerminalWindow size={15} />Terminal
          </button>
          <span className="account-email" title={user.email}>{user.email}</span>
          <button className="account-signout" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      <TerminalPanel
        open={terminalOpen}
        tab={terminalTab}
        onTabChange={setTerminalTab}
        onClose={() => setTerminalOpen(false)}
        lines={terminalLines}
        command={terminalCommandText}
        onCommandChange={setTerminalCommandText}
        onCommand={executeTerminalCommand}
        connections={connections}
        onConnectionChange={changeConnection}
        onTest={testConnection}
        connectionStates={connectionStates}
        saving={saveState === "saving"}
        kaggleStatus={kaggleStatus}
        kaggleTelemetry={kaggleTelemetry}
      />

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
            onKaggleRun={runWorkflow}
            onKaggleConnect={() => connectKaggleBridge()}
            kaggleStatus={kaggleStatus}
            kaggleRunStatus={kaggleRunStatus}
            outputFiles={kaggleOutputFiles}
            onSaveOutput={saveKaggleOutput}
            outputFolderName={outputRootHandle ? `${outputRootHandle.name}\\SCENES\\${taskCode.replace(/\D/g, "").slice(0, 6)}` : "Choose an output folder"}
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
            runHistory={runHistory.filter((run) => run.taskCode === readyTaskCode)}
            workflowVersions={workflowVersions}
            onRestoreVersion={restoreWorkflowVersion}
          />
        )}
        <div className="flow-viewport is-shifted">
          <div className="canvas-run-status" role="status" aria-live="polite">
            <span className={"status-dot " + (running ? "active" : runMessage.toLowerCase().includes("completed") ? "done" : runMessage.toLowerCase().includes("failed") ? "paused" : "unconfigured")} />
          <span>{runMessage || "Connect the Kaggle notebook bridge to run this workflow."}</span>
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
          <div className={"toast toast-" + runKind} role="status">
            {runKind === "success" ? <CheckCircle size={17} weight="fill" /> : <Sparkle size={17} weight="fill" />}
            {runMessage}
            <button onClick={() => setRunMessage("")} aria-label="Dismiss message"><X size={14} /></button>
          </div>
        )}
      </section>
      <OutputDialog open={dialogOpen} onClose={() => setDialogOpen(false)} taskCode={taskCode.replace(/\D/g, "").slice(0, 6)} outputData={outputData} outputFiles={kaggleOutputFiles} onSaveOutput={saveKaggleOutput} outputSaving={outputSaving} />
    </main>
  );
}

export function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    const preventCopy = (event) => event.preventDefault();
    document.addEventListener("copy", preventCopy, true);
    return () => document.removeEventListener("copy", preventCopy, true);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setCheckingSession(false);
      return undefined;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setUser(data.session?.user || null);
        setCheckingSession(false);
      }
    }).catch(() => { if (active) setCheckingSession(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      setCheckingSession(false);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  async function signOut() {
    await supabase?.auth.signOut();
  }

  if (checkingSession) return <main className="auth-loading"><span className="auth-loading-dot" />Restoring your studio…</main>;
  if (passwordRecovery && user) return <PasswordUpdateScreen onComplete={() => setPasswordRecovery(false)} />;
  if (user) return <ReactFlowProvider><Workspace user={user} onSignOut={signOut} /></ReactFlowProvider>;
  return <AuthScreen onAuthenticated={setUser} />;
}

function PasswordUpdateScreen({ onComplete }) {
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function updatePassword(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    if (password !== String(form.get("confirmPassword") || "")) {
      setNotice("Those passwords don’t match yet.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return setNotice(error.message);
      onComplete();
    } catch (error) { setNotice(error.message || "Could not update your password. Try again."); }
    finally { setBusy(false); }
  }
  return (
    <main className="auth-page">
      <div className="auth-frame">
        <section className="auth-card auth-reset-card" aria-labelledby="auth-heading">
          <div className="auth-brand-mark" aria-hidden="true"><FilmReel size={20} weight="fill" /></div>
          <div className="auth-heading-block"><h1 id="auth-heading">Set a new<br />password</h1><p>Choose a new password for your account.</p></div>
          <form className="auth-form" onSubmit={updatePassword}>
            <label className="auth-field"><span>New password</span><input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
            <label className="auth-field"><span>Confirm password</span><input name="confirmPassword" type="password" minLength={8} autoComplete="new-password" required /></label>
            <button className="auth-submit" disabled={busy}>{busy ? "Saving…" : "Update password"}</button>
          </form>
          {notice && <p className="auth-notice" role="status">{notice}</p>}
        </section>
        <div className="auth-art" aria-hidden="true"><img src="/images/auth-halftone.png" alt="" /></div>
      </div>
    </main>
  );
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [notice, setNotice] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const configured = isSupabaseConfigured;
  const isCreate = mode === "create";

  async function submitAuth(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");
    const confirm = String(data.get("confirmPassword") || "");
    setNotice("");
    if (isCreate && password !== confirm) {
      setNotice("Those passwords don’t match yet.");
      return;
    }
    if (!configured) {
      setNotice("Account service setup is required. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the deployment environment.");
      return;
    }
    setBusy(true);
    try {
      const result = isCreate
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) { setNotice(result.error.message); return; }
      if (result.data.session?.user) { onAuthenticated(result.data.session.user); return; }
      setNotice("Check your email for the confirmation link, then sign in to open your studio.");
      if (isCreate) setMode("login");
    } catch (error) { setNotice(error.message || "Account service could not be reached. Try again."); }
    finally { setBusy(false); }
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setNotice("");
  }

  async function requestPasswordReset() {
    if (!configured) return setNotice("Account service setup is required before password reset can be used.");
    const email = String(document.querySelector(".auth-form input[name=email]")?.value || "").trim();
    if (!email) return setNotice("Enter your email address first.");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      setNotice(error ? error.message : "If an account exists for that email, a password reset link is on its way.");
    } catch (error) { setNotice(error.message || "Could not send the password reset request. Try again."); }
  }

  return (
    <main className="auth-page">
      <div className="auth-frame">
        <section className="auth-card" aria-labelledby="auth-heading">
          <div className="auth-brand-mark" aria-hidden="true"><FilmReel size={20} weight="fill" /></div>
          <div className="auth-heading-block">
            <h1 id="auth-heading">{isCreate ? <>Create an<br />account</> : "Sign In"}</h1>
            <p>{isCreate ? "Create an account to save your movie workflows." : "Continue to access your dashboard."}</p>
          </div>

          {!configured && <p className="auth-notice auth-config-notice" role="status">The sign-in service is not configured for this deployment yet.</p>}
          <form className="auth-form" onSubmit={submitAuth}>
            <label className="auth-field">
              <span>Email</span>
              <input type="email" name="email" autoComplete="email" placeholder="Enter your email" required />
            </label>
            <label className="auth-field auth-password-field">
              <div className="auth-field-label-row">
                <span>Password</span>
                {!isCreate && <button className="auth-forgot" type="button" onClick={requestPasswordReset}>Forgot Password?</button>}
              </div>
              <div className="auth-password-wrap">
                <input type={showPassword ? "text" : "password"} name="password" autoComplete={isCreate ? "new-password" : "current-password"} placeholder="Enter your password" minLength={8} required />
                <button type="button" className="auth-show-password" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button>
              </div>
            </label>
            {isCreate && <label className="auth-field"><span>Confirm password</span><input type={showPassword ? "text" : "password"} name="confirmPassword" autoComplete="new-password" placeholder="Enter your password again" minLength={8} required /></label>}
            <button className="auth-submit" type="submit" disabled={busy || !configured}>{busy ? "Please wait…" : isCreate ? "Create Account" : "Sign In"}</button>
          </form>

          {notice && <p className="auth-notice" role="status">{notice}</p>}
          <p className="auth-switch"><span>{isCreate ? "Already have an account?" : "Don’t have an account?"}</span><button type="button" onClick={() => switchMode(isCreate ? "login" : "create")}>{isCreate ? "Sign In" : "Create an Account"}</button></p>
        </section>
        <div className="auth-art" aria-hidden="true"><img src="/images/auth-halftone.png" alt="" /></div>
      </div>
    </main>
  );
}
