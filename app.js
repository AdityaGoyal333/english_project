// Many Figs
// Goal, then the full resume and the full note, then a graph.
// Left: what they have already done. Right: the goal.
// Lanes between them are different trajectories, all ending at that goal.
// The API key stays on the server. The PDF file is read here and is not uploaded.

const STALL = /\b(fail(?:ed|ure)?|froze|frozen|drop(?:ped)?|quit|stall(?:ed)?|stuck|reject(?:ed)?|did not|didn't|could not|couldn't|missed|gave up|fell through)\b/i;

const state = { goal: "", resume: "", year: "" };

const $ = (sel) => document.querySelector(sel);

function show(name) {
  document.querySelectorAll("[data-screen]").forEach((el) => {
    el.hidden = el.dataset.screen !== name;
  });
  const nav = $(".steps");
  nav.hidden = name === "home";
  const order = ["goal", "journey", "paths"];
  const current = order.indexOf(name);
  nav.querySelectorAll("[data-step]").forEach((li) => {
    const mine = order.indexOf(li.dataset.step);
    li.dataset.state = mine < current ? "done" : mine === current ? "now" : "ahead";
  });
  window.scrollTo(0, 0);
}

function pieces(text) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^[\s\-*•\d.)]+/, "").trim())
    .filter((line) => line.length > 2 && !isHeading(line));
  const raw = lines.length >= 2 ? lines : text.split(/(?<=[.!?])\s+/);
  return raw.map((line) => line.trim()).filter((line) => line.length > 2);
}

function isHeading(line) {
  return line.length < 28 && line === line.toUpperCase() && /[A-Z]/.test(line);
}

function shorten(text, max) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max - 1).trim() + "…";
}

function esc(text) {
  return text.replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function wrap(text, width) {
  const words = shorten(text, 90).split(" ");
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? line + " " + word : word;
    if (next.length > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

// Used only when OpenAI is unavailable. The real request sends the full text.
function localGraph() {
  const done = pieces(state.resume).slice(0, 4).map((text) => ({
    text: shorten(text, 80),
    source: "Resume",
  }));
  const yearLines = pieces(state.year);
  const stall = yearLines.find((line) => STALL.test(line));
  const recent = yearLines.find((line) => line !== stall);
  if (recent) done.push({ text: shorten(recent, 80), source: "This year" });
  const proof = done[0] ? done[0].text : "what you can do this month";

  return {
    done: done,
    trajectories: [
      {
        title: "Direct",
        why: "The shortest use of what you already have.",
        steps: [{ text: "Use “" + shorten(proof, 42) + "” and take the next small step." }],
      },
      {
        title: "Around",
        why: "This route still reaches the goal if one step stays stalled.",
        steps: stall
          ? [{ text: "Leave this where it is: " + shorten(stall, 70) }, { text: "Continue toward the goal by another step." }]
          : [{ text: "Keep a side route open, so one failed step cannot close the goal." }],
      },
      {
        title: "Longer",
        why: "Build the missing foundation, then the same goal.",
        steps: [{ text: "Spend a season on the foundation the goal still needs." }, { text: "Then walk the rest of the way." }],
      },
    ],
  };
}

function curve(x1, y1, x2, y2) {
  const mid = (x1 + x2) / 2;
  return `<path d="M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}" class="edge"/>`;
}

function nodeBox(x, y, w, h, text, kind) {
  const lines = wrap(text, kind === "goal" ? 18 : 22);
  const start = y + (h - lines.length * 14) / 2 + 11;
  const labels = lines.map((line, i) => {
    return `<text x="${x + w / 2}" y="${start + i * 14}" text-anchor="middle" class="label ${kind}">${esc(line)}</text>`;
  }).join("");
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" class="node ${kind}"/>${labels}`;
}

// Left column is the past. Each lane is one trajectory. One goal sits on the right.
function renderGraph(reading) {
  const done = (reading.done || []).slice(0, 6);
  const lanes = (reading.trajectories || []).slice(0, 4);
  const nodeW = 150;
  const goalW = 160;
  const nodeH = 84;
  const gapX = 28;
  const pad = 12;
  const maxSteps = Math.max(1, ...lanes.map((lane) => lane.steps.length));
  const past = done.length ? done : [{ text: "You are here", source: "" }];

  const donePitch = nodeH + 14;
  const lanePitch = nodeH + 40;
  const doneH = past.length * donePitch - 14;
  const lanesH = lanes.length * lanePitch - 16;
  const height = pad * 2 + Math.max(doneH, lanesH, nodeH);
  const width = pad + nodeW + gapX + maxSteps * (nodeW + gapX) + gapX + goalW + pad;

  const doneTop = (height - doneH) / 2;
  const lanesTop = (height - lanesH) / 2;
  const goalX = width - pad - goalW;
  const goalY = (height - nodeH) / 2;
  const railX = pad + nodeW + gapX / 2;

  const donePos = past.map((item, i) => ({
    x: pad,
    y: doneTop + i * donePitch,
    text: item.text,
  }));
  const lanePos = lanes.map((lane, i) => {
    const y = lanesTop + i * lanePitch + 16;
    return {
      title: lane.title,
      why: lane.why,
      y: y,
      steps: lane.steps.map((step, s) => ({
        x: pad + nodeW + gapX + s * (nodeW + gapX),
        y: y,
        text: step.text,
      })),
    };
  });

  const edges = [];
  const railTop = donePos[0].y + nodeH / 2;
  const railBot = donePos[donePos.length - 1].y + nodeH / 2;
  edges.push(`<path d="M ${railX} ${railTop} L ${railX} ${railBot}" class="edge"/>`);
  donePos.forEach((item) => {
    const y = item.y + nodeH / 2;
    edges.push(`<path d="M ${item.x + nodeW} ${y} L ${railX} ${y}" class="edge"/>`);
  });
  lanePos.forEach((lane) => {
    const first = lane.steps[0];
    edges.push(curve(railX, (railTop + railBot) / 2, first.x, first.y + nodeH / 2));
    lane.steps.forEach((step, i) => {
      if (i === 0) return;
      const prev = lane.steps[i - 1];
      edges.push(curve(prev.x + nodeW, prev.y + nodeH / 2, step.x, step.y + nodeH / 2));
    });
    const last = lane.steps[lane.steps.length - 1];
    edges.push(curve(last.x + nodeW, last.y + nodeH / 2, goalX, goalY + nodeH / 2));
  });

  const boxes = donePos.map((item) => nodeBox(item.x, item.y, nodeW, nodeH, item.text, "done")).join("");
  const steps = lanePos.map((lane) => {
    const title = `<text x="${lane.steps[0].x}" y="${lane.y - 8}" class="lane-title">${esc(lane.title)}</text>`;
    const nodes = lane.steps.map((step) => nodeBox(step.x, step.y, nodeW, nodeH, step.text, "step")).join("");
    const tip = esc(lane.why || lane.title);
    return `<g><title>${tip}</title>${title}${nodes}</g>`;
  }).join("");
  const goalBox = nodeBox(goalX, goalY, goalW, nodeH, state.goal, "goal");

  const desc = lanes.map((lane) => lane.title + ": " + lane.steps.map((step) => step.text).join(", ")).join(". ");
  $("#graph").setAttribute("viewBox", `0 0 ${width} ${height}`);
  $("#graph").innerHTML = `
    <title id="graph-title">Trajectories from what you have done to your goal</title>
    <desc id="graph-desc">${esc(desc)}</desc>
    ${edges.join("")}
    ${boxes}
    ${steps}
    ${goalBox}
  `;
  $("#path-goal").textContent = state.goal;
}

// The whole goal, the whole resume, and the whole note. Nothing is cut down first.
async function readingFromApi() {
  const response = await fetch("/api/paths", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      goal: state.goal,
      resume: state.resume,
      note: state.year,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "OpenAI could not write the paths.");
  return data;
}

function clearAll() {
  state.goal = "";
  state.resume = "";
  state.year = "";
  $("#goal").value = "";
  $("#resume").value = "";
  $("#year").value = "";
  $("#file-hint").textContent = "";
  $("#goal-error").hidden = true;
  $("#journey-error").hidden = true;
}

$("#begin").addEventListener("click", () => show("goal"));
$("#goal-back").addEventListener("click", () => show("home"));
$("#journey-back").addEventListener("click", () => show("goal"));
$("#edit").addEventListener("click", () => show("journey"));
$("#restart").addEventListener("click", () => {
  clearAll();
  show("home");
});

$("#goal-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const goal = $("#goal").value.trim();
  if (!goal) {
    $("#goal-error").hidden = false;
    return;
  }
  $("#goal-error").hidden = true;
  state.goal = goal;
  show("journey");
});

async function readPdf(file) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("vendor/pdf.worker.min.js", document.baseURI).href;
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(linesFromPdfItems(content.items));
  }
  return pages.filter(Boolean).join("\n");
}

function linesFromPdfItems(items) {
  const lines = [];
  let currentY = null;
  let parts = [];
  items.forEach((item) => {
    if (!item.str || !item.str.trim()) return;
    const y = item.transform ? Math.round(item.transform[5]) : 0;
    if (currentY !== null && Math.abs(y - currentY) > 2) {
      lines.push(parts.join(" ").replace(/\s+/g, " ").trim());
      parts = [];
    }
    currentY = y;
    parts.push(item.str);
  });
  if (parts.length) lines.push(parts.join(" ").replace(/\s+/g, " ").trim());
  return lines.filter(Boolean).join("\n");
}

async function readResumeFile(file) {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf) return readPdf(file);
  if (file.type.startsWith("text/") || /\.(txt|md|text)$/i.test(file.name)) return file.text();
  throw new Error("unsupported");
}

$("#resume-file").addEventListener("change", async () => {
  const file = $("#resume-file").files[0];
  const hint = $("#file-hint");
  if (!file) return;
  hint.textContent = "Reading " + file.name + "…";
  try {
    const text = (await readResumeFile(file)).trim();
    if (!text) {
      hint.textContent = "This PDF has no selectable text. If it is a scan, paste the resume.";
      return;
    }
    $("#resume").value = text;
    hint.textContent = "Loaded " + file.name;
  } catch (err) {
    hint.textContent = "Could not read that file. Paste the resume text.";
  }
});

$("#journey-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const resume = $("#resume").value.trim();
  const year = $("#year").value.trim();
  if (!resume || !year) {
    $("#journey-error").hidden = false;
    return;
  }
  $("#journey-error").hidden = true;
  state.resume = resume;
  state.year = year;

  const button = event.submitter;
  if (button) {
    button.disabled = true;
    button.textContent = "Drawing the paths…";
  }
  try {
    renderGraph(await readingFromApi());
    $("#path-note").textContent = "Written by OpenAI from your goal, your full resume, and your note.";
  } catch (err) {
    renderGraph(localGraph());
    $("#path-note").textContent = err.message + " Showing a local map instead.";
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Draw the paths";
    }
  }
  show("paths");
});

show("home");
