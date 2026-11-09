// Many Figs
// Order: goal (destination) -> resume + short note (journey) -> three paths.
// A stall comes only from the note. A resume gap stays a future step.
// Resume text, including text read from a PDF, never leaves the browser.

const STALL = /\b(fail(?:ed|ure)?|froze|frozen|drop(?:ped)?|quit|stall(?:ed)?|stuck|reject(?:ed)?|did not|didn't|could not|couldn't|missed|gave up|fell through)\b/i;

const state = {
  goal: "",
  evidence: [], // { id, text, on } from the resume
  notes: [], // { id, text, on, bend } from the short note
};

const $ = (sel) => document.querySelector(sel);

function show(name) {
  document.querySelectorAll("[data-screen]").forEach((el) => {
    el.hidden = el.dataset.screen !== name;
  });

  const nav = $(".steps");
  nav.hidden = name === "home";
  const order = ["goal", "journey", "check", "paths"];
  const current = order.indexOf(name);
  nav.querySelectorAll("[data-step]").forEach((li) => {
    const mine = order.indexOf(li.dataset.step);
    li.dataset.state = mine < current ? "done" : mine === current ? "now" : "ahead";
  });
  window.scrollTo(0, 0);
}

// Turn pasted text into usable lines. Headings like EXPERIENCE are dropped.
function pieces(text) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^[\s\-*•\d.)]+/, "").trim())
    .filter((line) => line.length > 2 && !isHeading(line));

  const raw = lines.length >= 2 ? lines : text.split(/(?<=[.!?])\s+/);
  return raw.map((line) => line.trim()).filter((line) => line.length > 2).slice(0, 8);
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

// Read the two journey fields into confirmable facts.
function parseJourney(resume, year) {
  state.evidence = pieces(resume).map((text, i) => ({ id: "e" + i, text, on: true }));

  const bits = pieces(year);
  const bendAt = bits.findIndex((text) => STALL.test(text));
  state.notes = bits.map((text, i) => ({
    id: "n" + i,
    text,
    on: true,
    bend: i === bendAt,
  }));
}

function renderCheck() {
  $("#check-goal").textContent = state.goal;
  $("#evidence-list").innerHTML = state.evidence.length
    ? state.evidence.map(factRow).join("")
    : "<p>No resume lines stood out. You can go back and add a few.</p>";

  const noneChecked = state.notes.some((note) => note.bend) ? "" : "checked";
  const noteRows = state.notes.map((note) => {
    return factRow(note) + bendChoice(note);
  }).join("");

  $("#notes-list").innerHTML = state.notes.length
    ? `<label class="bend-choice"><input type="radio" name="bend" value="none" ${noneChecked} /> No stall</label>` + noteRows
    : "<p>No note lines stood out. You can go back and add what happened.</p>";
}

function factRow(item) {
  return `<label class="item"><input type="checkbox" id="${item.id}" ${item.on ? "checked" : ""} /> <span>${esc(item.text)}</span></label>`;
}

function bendChoice(note) {
  return `<label class="bend-choice"><input type="radio" name="bend" value="${note.id}" ${note.bend ? "checked" : ""} /> This step stalled</label>`;
}

// Pull the checkboxes and the stall radio back into state.
function readCheck() {
  state.evidence.forEach((item) => {
    const box = document.getElementById(item.id);
    if (box) item.on = box.checked;
  });
  const picked = $('input[name="bend"]:checked');
  const bendId = picked ? picked.value : "none";
  state.notes.forEach((note) => {
    const box = document.getElementById(note.id);
    if (box) note.on = box.checked;
    note.bend = note.id === bendId && note.on;
  });
}

function step(text, kind, source) {
  return { text, kind, source };
}

// Three routes, one destination.
// Direct uses proof they already have.
// Around keeps going even if the marked stall stays stalled.
// Longer builds a foundation, then comes back to the same goal.
function buildPaths() {
  const goal = state.goal;
  const done = state.evidence.filter((item) => item.on);
  const moved = state.notes.filter((note) => note.on && !note.bend);
  const bend = state.notes.find((note) => note.bend) || null;
  const proof = done[0];
  const second = done[1];
  const recent = moved[0];

  const direct = [];
  if (proof) direct.push(step(proof.text, "done", "Resume"));
  if (second) direct.push(step(second.text, "done", "Resume"));
  if (recent) direct.push(step(recent.text, "done", "This year"));
  direct.push(step(
    proof
      ? `Carry “${shorten(proof.text, 72)}” forward, and do the next small thing “${goal}” asks for.`
      : `Do one small thing this month that “${goal}” would count as a start.`,
    "next",
    "Ahead"
  ));

  const around = [];
  if (proof) around.push(step(proof.text, "done", "Resume"));
  if (bend) {
    around.push(step(bend.text, "bend", "This year"));
    around.push(step(
      `Leave that step where it is. Take a different step that still ends at “${goal}.”`,
      "next",
      "Ahead"
    ));
    if (recent) {
      around.push(step(`Use “${shorten(recent.text, 72)}” as the way around it.`, "later", "This year"));
    }
  } else {
    around.push(step(
      `You did not mark a stall. This route stays open so one failed step later can bend, and “${goal}” stays put.`,
      "next",
      "Ahead"
    ));
  }

  const longer = [];
  if (proof) longer.push(step(proof.text, "done", "Resume"));
  longer.push(step(`Spend a season on the foundation “${goal}” still needs.`, "next", "Ahead"));
  longer.push(step(
    proof
      ? `Then bring “${shorten(proof.text, 72)}” back in, and walk the rest of the way.`
      : `Then walk toward “${goal}” with that foundation under you.`,
    "later",
    "Ahead"
  ));

  const hereBits = [proof, second, recent].filter(Boolean).map((item) => shorten(item.text, 80));

  return {
    here: hereBits.length
      ? hereBits.join(" · ")
      : "No confirmed steps yet. These paths start from the goal alone.",
    paths: [
      { title: "Direct", why: "The shortest route that uses what you already have.", steps: direct },
      { title: "Around", why: "The route that still reaches the goal if one step stalls.", steps: around },
      { title: "Longer", why: "Foundation first. The same destination.", steps: longer },
    ],
  };
}

function renderPaths() {
  const reading = buildPaths();
  $("#path-goal").textContent = state.goal;
  $("#here").textContent = "You are here: " + reading.here;
  $("#destination").textContent = state.goal;
  $("#path-grid").innerHTML = reading.paths.map((path) => {
    const steps = path.steps.map((item) => {
      return `<li class="step ${item.kind}"><span class="source">${esc(item.source)}</span>${esc(item.text)}</li>`;
    }).join("");
    return `<article class="path"><h2>${esc(path.title)}</h2><p class="path-why">${esc(path.why)}</p><ol>${steps}</ol></article>`;
  }).join("");
}

function clearAll() {
  state.goal = "";
  state.evidence = [];
  state.notes = [];
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
$("#check-back").addEventListener("click", () => show("journey"));
$("#edit").addEventListener("click", () => show("check"));

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

// Read a PDF locally. Words on the same visual line stay together.
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

$("#journey-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const resume = $("#resume").value.trim();
  const year = $("#year").value.trim();
  if (!resume || !year) {
    $("#journey-error").hidden = false;
    return;
  }
  $("#journey-error").hidden = true;
  parseJourney(resume, year);
  renderCheck();
  show("check");
});

$("#check-form").addEventListener("submit", (event) => {
  event.preventDefault();
  readCheck();
  renderPaths();
  show("paths");
});

show("home");
