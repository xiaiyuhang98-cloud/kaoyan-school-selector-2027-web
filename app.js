"use strict";
const data = JSON.parse(document.getElementById("report-data").textContent);
const tierOrder = ["top", "watch", "high_risk_high_reward", "insufficient_data", "excluded"];
const byId = new Map(data.candidates.map(item => [item.program_id, item]));
const dimensionLabels = data.meta.dimension_labels;
const dimensionKeys = Object.keys(dimensionLabels);
const presets = {
  default: Object.fromEntries(Object.entries(data.meta.default_weights).map(([key, value]) => [key, value * 100])),
  safe: {admission_difficulty: 30, exam_subject_fit: 25, city_and_computing_jobs: 10,
    cross_major_friendliness: 15, admission_stability: 10, institution_platform: 5, cost_and_living: 5},
  city: {admission_difficulty: 15, exam_subject_fit: 15, city_and_computing_jobs: 30,
    cross_major_friendliness: 10, admission_stability: 5, institution_platform: 20, cost_and_living: 5},
  platform: {admission_difficulty: 15, exam_subject_fit: 15, city_and_computing_jobs: 20,
    cross_major_friendliness: 10, admission_stability: 5, institution_platform: 30, cost_and_living: 5}
};
const storageKey = "kaoyan-selector-compare-v1";
let compared = new Set();
try { compared = new Set(JSON.parse(localStorage.getItem(storageKey) || "[]").filter(id => byId.has(id)).slice(0, 3)); }
catch (_error) { compared = new Set(); }

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function sourceLink(url, label = "官方依据") {
  if (!url) return node("span", "", "待补");
  const link = node("a", "source-link", label);
  link.href = url; link.target = "_blank"; link.rel = "noreferrer";
  return link;
}
function pct(value) {
  const percent = Math.round(value * 1000) / 10;
  return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(1)}%`;
}
function currentWeights() {
  return Object.fromEntries(dimensionKeys.map(key => [key, Number(document.getElementById(`weight-${key}`).value)]));
}
function personalFit(item) {
  const weights = currentWeights();
  const present = dimensionKeys.filter(key => item.dimensions[key] !== null && weights[key] > 0);
  const total = present.reduce((sum, key) => sum + weights[key], 0);
  if (!total) return null;
  return present.reduce((sum, key) => sum + item.dimensions[key] * weights[key], 0) / total;
}
function referenceFor(programId) {
  const admissionRows = data.admissions[programId] || [];
  if (admissionRows.length) {
    const latest = [...admissionRows].sort((a, b) => b.year - a.year)[0];
    return {value: latest.reexam_cutoff, label: `${latest.year} 复试线（官方统计）`};
  }
  const distribution = data.distributions.find(item => item.program_id === programId);
  if (distribution) return {value: distribution.initial_median, label: `${distribution.year} 复试名单初试中位数`};
  return null;
}
function saveCompared() {
  try { localStorage.setItem(storageKey, JSON.stringify([...compared])); } catch (_error) { /* file privacy mode */ }
}
function setPreset(name) {
  const values = presets[name] || presets.default;
  dimensionKeys.forEach(key => {
    const input = document.getElementById(`weight-${key}`);
    input.value = values[key];
    document.getElementById(`weight-output-${key}`).value = `${values[key]}%`;
  });
  renderCandidateRows(); renderCompare(); updatePersonalNote();
}
function renderWeightControls() {
  const host = document.getElementById("weight-controls");
  dimensionKeys.forEach(key => {
    const label = node("label", "weight-control");
    const caption = node("span");
    const output = node("output", "", `${presets.default[key]}%`); output.id = `weight-output-${key}`;
    caption.append(node("b", "", dimensionLabels[key]), output);
    const input = document.createElement("input");
    input.type = "range"; input.min = "0"; input.max = "50"; input.step = "1";
    input.value = presets.default[key]; input.id = `weight-${key}`;
    input.addEventListener("input", () => {
      output.value = `${input.value}%`;
      document.getElementById("preference-preset").value = "custom";
      renderCandidateRows(); renderCompare(); updatePersonalNote();
    });
    label.append(caption, input); host.append(label);
  });
  const custom = node("option", "", "自定义"); custom.value = "custom"; custom.disabled = true;
  document.getElementById("preference-preset").append(custom);
}
function updatePersonalNote() {
  const total = Object.values(currentWeights()).reduce((sum, value) => sum + value, 0);
  const score = document.getElementById("baseline-score").value;
  document.getElementById("personal-note").textContent =
    `当前权重合计 ${total}%（计算时自动归一化）。${score ? `个人基准估分 ${score} 分只与有严格口径的历史参照比较，不生成录取概率。` : "填写估分后，可在对比卡中查看与少量历史参照的分差。"}`;
}

function renderTopCards() {
  const host = document.getElementById("top-cards");
  data.candidates.filter(x => x.tier === "top").forEach(item => {
    const card = node("article", "top-card");
    card.dataset.rank = String(item.tier_rank).padStart(2, "0");
    const meta = node("div", "card-meta");
    meta.append(node("span", "", item.city), node("span", "", `${item.subject_bundle} · ${item.subject_evidence_year}`));
    const title = node("h3", "", item.school_name);
    title.append(node("span", "", `${item.degree_label} · ${item.program_name}`));
    const scores = node("div", "card-score");
    [["适配分", item.fit_score.toFixed(2)], ["证据完整度", pct(item.evidence_completeness)]].forEach(([label, value]) => {
      const box = node("div"); box.append(node("strong", "", value), node("small", "", label)); scores.append(box);
    });
    const gap = node("p", "gap-note", item.evidence_gaps);
    card.append(meta, title, scores, gap, sourceLink(item.source_url));
    host.append(card);
  });
}

function populateFilters() {
  const tierSelect = document.getElementById("tier-filter");
  tierOrder.filter(t => data.candidates.some(x => x.tier === t)).forEach(tier => {
    const item = data.candidates.find(x => x.tier === tier);
    const option = node("option", "", `${item.tier_label}（${data.candidates.filter(x => x.tier === tier).length}）`);
    option.value = tier; tierSelect.append(option);
  });
  const citySelect = document.getElementById("city-filter");
  [...new Set(data.candidates.map(x => x.city))].sort((a,b) => a.localeCompare(b, "zh-CN")).forEach(city => {
    const option = node("option", "", city); option.value = city; citySelect.append(option);
  });
}

function evidenceMeter(completeness) {
  const wrap = node("div");
  const meter = node("div", "evidence-meter");
  const filled = Math.round(completeness * 8);
  for (let i = 0; i < 8; i += 1) meter.append(node("i", i < filled ? "filled" : ""));
  wrap.append(meter, node("span", "evidence-value", pct(completeness)));
  return wrap;
}

function renderCandidateRows() {
  const tier = document.getElementById("tier-filter").value;
  const city = document.getElementById("city-filter").value;
  const degree = document.getElementById("degree-filter").value;
  const minimumEvidence = Number(document.getElementById("evidence-filter").value);
  const only408 = document.getElementById("subject-408-filter").checked;
  const sort = document.getElementById("sort-select").value;
  const query = document.getElementById("search-input").value.trim().toLowerCase();
  const rows = data.candidates.filter(item => {
    const haystack = `${item.school_name} ${item.program_name} ${item.subject_bundle}`.toLowerCase();
    return (tier === "all" || item.tier === tier) && (city === "all" || item.city === city)
      && (degree === "all" || item.degree_type === degree)
      && item.evidence_completeness >= minimumEvidence
      && (!only408 || item.subject_bundle.includes("408"))
      && (!query || haystack.includes(query));
  });
  rows.sort((a, b) => {
    if (sort === "school") return a.school_name.localeCompare(b.school_name, "zh-CN") || a.program_id.localeCompare(b.program_id);
    if (sort === "evidence") return b.evidence_completeness - a.evidence_completeness || b.fit_score - a.fit_score;
    if (sort === "fit") return b.fit_score - a.fit_score || a.program_id.localeCompare(b.program_id);
    return (personalFit(b) ?? -1) - (personalFit(a) ?? -1) || b.evidence_completeness - a.evidence_completeness;
  });
  const tbody = document.querySelector("#candidate-table tbody"); tbody.replaceChildren();
  rows.forEach(item => {
    const tr = node("tr");
    const compareTd = node("td");
    const compareButton = node("button", "compare-toggle", compared.has(item.program_id) ? "已选" : "对比");
    compareButton.type = "button"; compareButton.setAttribute("aria-pressed", String(compared.has(item.program_id)));
    compareButton.addEventListener("click", () => toggleCompared(item.program_id)); compareTd.append(compareButton);
    const tierTd = node("td"); tierTd.append(node("span", `tier-chip tier-${item.tier}`, item.tier_label));
    const programTd = node("td", "program-cell");
    programTd.append(node("strong", "", item.school_name), node("span", "", `${item.degree_label} · ${item.program_name}`));
    const personal = personalFit(item);
    const scoreTd = node("td", "score-cell", `${personal === null ? "—" : personal.toFixed(2)} / ${item.fit_score.toFixed(2)}`);
    const evidenceTd = node("td"); evidenceTd.append(evidenceMeter(item.evidence_completeness));
    const sourceTd = node("td"); sourceTd.append(sourceLink(item.source_url));
    [compareTd, tierTd, programTd, node("td", "", item.city), scoreTd, evidenceTd,
      node("td", "", `${item.subject_bundle}${item.subject_evidence_year ? `（${item.subject_evidence_year}）` : ""}`),
      node("td", "", item.evidence_gaps), sourceTd].forEach(td => tr.append(td));
    tbody.append(tr);
  });
  document.getElementById("result-count").textContent = `显示 ${rows.length} / ${data.candidates.length} 项`;
  document.getElementById("empty-state").hidden = rows.length !== 0;
}

function toggleCompared(programId) {
  if (compared.has(programId)) compared.delete(programId);
  else if (compared.size < 3) compared.add(programId);
  else {
    document.getElementById("compare-empty").hidden = false;
    document.getElementById("compare-empty").textContent = "最多选择 3 项；请先取消一个候选。";
    return;
  }
  saveCompared(); renderCandidateRows(); renderCompare();
}

function renderCompare() {
  const host = document.getElementById("compare-grid"); host.replaceChildren();
  const empty = document.getElementById("compare-empty"); empty.hidden = compared.size > 0;
  if (!compared.size) empty.textContent = "在候选表中勾选项目，选择会保存在当前浏览器。";
  const baseline = Number(document.getElementById("baseline-score").value) || null;
  [...compared].map(id => byId.get(id)).forEach(item => {
    const card = node("article", "compare-card");
    card.append(node("h4", "", item.school_name), node("p", "", `${item.degree_label} · ${item.program_name} · ${item.city}`));
    const scores = node("div", "compare-scores");
    [["个人适配", personalFit(item)], ["证据完整度", item.evidence_completeness * 100]].forEach(([label, value]) => {
      const box = node("div"); box.append(node("strong", "", value === null ? "—" : Number(value).toFixed(1)), node("small", "", label)); scores.append(box);
    });
    const dimensions = node("ul", "dimension-list");
    dimensionKeys.forEach(key => {
      const li = node("li"); li.append(node("span", "", dimensionLabels[key]), node("strong", "", item.dimensions[key] === null ? "缺证据" : Number(item.dimensions[key]).toFixed(1))); dimensions.append(li);
    });
    const reference = referenceFor(item.program_id);
    let referenceText = "暂无严格口径的历史分数参照";
    if (reference) {
      const delta = baseline === null ? "" : `；个人估分相差 ${baseline - reference.value >= 0 ? "+" : ""}${(baseline - reference.value).toFixed(0)} 分`;
      referenceText = `${reference.label}：${reference.value} 分${delta}。该分差不是录取概率。`;
    }
    const remove = node("button", "compare-toggle", "移出对比"); remove.type = "button";
    remove.addEventListener("click", () => toggleCompared(item.program_id));
    card.append(scores, dimensions, node("p", "reference-note", referenceText), sourceLink(item.source_url), remove);
    host.append(card);
  });
}

function renderSchoolCoverage() {
  const tbody = document.querySelector("#coverage-table tbody");
  data.school_coverage.forEach(item => {
    const tr = node("tr");
    const school = node("td", "program-cell");
    school.append(node("strong", "", item.school_name), node("span", "", item.school_id));
    const status = node("td");
    status.append(node("span", `coverage-chip coverage-${item.status}`, item.status_label));
    const source = node("td");
    source.append(sourceLink(item.source_url));
    [school, node("td", "", item.city), status,
      node("td", "", item.latest_evidence_year || "—"),
      node("td", "score-cell", item.program_evidence_rows),
      node("td", "score-cell", item.subject_evidence_rows),
      node("td", "score-cell", item.open_reviews),
      node("td", "", item.note), source].forEach(td => tr.append(td));
    tbody.append(tr);
  });
}

function renderNjupt() {
  const host = document.getElementById("njupt-stats");
  const table = node("table", "mini-table");
  const head = node("thead"); const hr = node("tr");
  ["项目", "年份", "报考", "复试线", "录取总数", "报录比"].forEach(x => hr.append(node("th", "", x)));
  head.append(hr); table.append(head);
  const body = node("tbody");
  Object.entries(data.admissions).forEach(([programId, rows]) => rows.forEach(row => {
    const tr = node("tr"); const program = byId.get(programId);
    [program.degree_label, row.year, row.applications, row.reexam_cutoff,
      row.admitted_total, row.application_to_admit_ratio.toFixed(2)].forEach(x => tr.append(node("td", "", x)));
    body.append(tr);
  }));
  table.append(body); host.append(table);
}

function renderDistributions() {
  const host = document.getElementById("zjut-distributions");
  data.distributions.forEach(item => {
    const program = byId.get(item.program_id);
    const wrap = node("div", "distribution");
    const head = node("div", "distribution__head");
    head.append(node("strong", "", program.degree_label), node("span", "", `n = ${item.sample_size} · 中位数 ${item.initial_median}`));
    const track = node("div", "quartile-track");
    const scaleMin = 280, scaleMax = 410, scale = n => Math.max(0, Math.min(100, (n-scaleMin)/(scaleMax-scaleMin)*100));
    const range = node("span", "range"); range.style.left = `${scale(item.initial_q1)}%`;
    range.style.width = `${scale(item.initial_q3)-scale(item.initial_q1)}%`;
    const median = node("span", "median"); median.style.left = `${scale(item.initial_median)}%`;
    const numbers = node("div", "distribution__numbers");
    numbers.append(node("span", "", `最低 ${item.initial_min}`), node("span", "", `Q1 ${item.initial_q1}`),
      node("span", "", `Q3 ${item.initial_q3}`), node("span", "", `最高 ${item.initial_max}`));
    wrap.append(head, track, numbers, sourceLink(item.source_url, "查看官方名单"));
    track.append(range, median); host.append(wrap);
  });
}

function renderAudit() {
  const a = data.audit;
  const values = [
    [a.snapshot_checksums_checked, "已核对快照哈希"],
    [a.program_evidence_rows_checked, "程序级证据"],
    [a.deidentified_rows_checked, "去标识化分数行"],
    [a.critical_open, "未关闭严重问题"]
  ];
  const host = document.getElementById("audit-ledger");
  values.forEach(([value, label]) => { const item = node("div", "audit-item");
    item.append(node("strong", "", value), node("span", "", label)); host.append(item); });
  const list = document.getElementById("manual-review-list");
  data.manual_reviews.forEach(item => {
    const li = node("li"); li.append(sourceLink(item.source_url, `${item.school_id} · ${item.year} · ${item.title}`),
      node("span", "", item.required_action)); list.append(li);
  });
}

renderWeightControls(); renderTopCards(); populateFilters(); setPreset("default"); renderSchoolCoverage();
renderNjupt(); renderDistributions(); renderAudit();
["tier-filter", "city-filter", "degree-filter", "evidence-filter", "sort-select"].forEach(id => document.getElementById(id).addEventListener("change", renderCandidateRows));
document.getElementById("subject-408-filter").addEventListener("change", renderCandidateRows);
document.getElementById("search-input").addEventListener("input", renderCandidateRows);
document.getElementById("preference-preset").addEventListener("change", event => setPreset(event.target.value));
document.getElementById("baseline-score").addEventListener("input", () => { renderCompare(); updatePersonalNote(); });
document.getElementById("reset-personalization").addEventListener("click", () => {
  document.getElementById("preference-preset").value = "default";
  document.getElementById("baseline-score").value = "";
  setPreset("default");
});
document.getElementById("clear-compare").addEventListener("click", () => {
  compared.clear(); saveCompared(); renderCandidateRows(); renderCompare();
});
