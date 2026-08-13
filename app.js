"use strict";
const data = JSON.parse(document.getElementById("report-data").textContent);
const tierOrder = ["top", "watch", "high_risk_high_reward", "insufficient_data", "excluded"];
const byId = new Map(data.candidates.map(item => [item.program_id, item]));
const historicalFacts = data.historical_facts || [];
const historyByProgram = new Map();
historicalFacts.forEach(item => { const rows = historyByProgram.get(item.program_id) || []; rows.push(item); historyByProgram.set(item.program_id, rows); });
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
  const history = (historyByProgram.get(programId) || []).filter(item => item.reexam_cutoff !== null)
    .sort((a, b) => b.year - a.year)[0];
  if (history) return {value: history.reexam_cutoff, label: `${history.year} 复试线（${history.study_scope}）`};
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
    const historyTd = node("td", "history-cell");
    const admissionRows = data.admissions[item.program_id] || [];
    const distribution = data.distributions.find(row => row.program_id === item.program_id);
    const fact = (historyByProgram.get(item.program_id) || []).sort((a, b) => b.year - a.year)[0];
    if (admissionRows.length) {
      const latest = [...admissionRows].sort((a, b) => b.year - a.year)[0];
      historyTd.append(node("strong", "", `${latest.year} 复试线 ${latest.reexam_cutoff}`),
        node("span", "", `录取 ${latest.admitted_total} · 报考 ${latest.applications}`));
    } else if (distribution) {
      historyTd.append(node("strong", "", `${distribution.year} 名单中位 ${distribution.initial_median}`),
        node("span", "", `Q1–Q3：${distribution.initial_q1}–${distribution.initial_q3}`));
    } else if (fact) {
      const metrics = [];
      if (fact.reexam_cutoff !== null) metrics.push(`复试线 ${fact.reexam_cutoff}`);
      if (fact.unified_exam_plan !== null) metrics.push(`统考 ${fact.unified_exam_plan}`);
      else if (fact.plan_total !== null) metrics.push(`计划 ${fact.plan_total}`);
      historyTd.append(node("strong", "", `${fact.year} ${metrics.join(" · ") || "已核验"}`),
        node("span", "", fact.study_scope), sourceLink(fact.source_url, "历史来源"));
    } else {
      historyTd.append(node("span", "missing-history", "暂无结构化历史数据"));
    }
    const sourceTd = node("td"); sourceTd.append(sourceLink(item.source_url));
    [compareTd, tierTd, programTd, node("td", "", item.city), scoreTd, evidenceTd,
      node("td", "", `${item.subject_bundle}${item.subject_evidence_year ? `（${item.subject_evidence_year}）` : ""}`),
      historyTd, node("td", "", item.evidence_gaps), sourceTd].forEach(td => tr.append(td));
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


function merged22408Outcomes(programKey) {
  const source = (data.outcomes_22408 || []).filter(row => row.program_key === programKey);
  const byYear = new Map();
  source.forEach(row => {
    const existing = byYear.get(row.year) || {};
    const merged = {...existing};
    Object.entries(row).forEach(([key, value]) => {
      if (value !== null && value !== "") merged[key] = value;
    });
    byYear.set(row.year, merged);
  });
  return [...byYear.values()].sort((a, b) => b.year - a.year);
}
function nullableMetric(value, suffix = "") {
  return value === null || value === undefined || value === "" ? "待核验" : `${value}${suffix}`;
}
function renderStrict22408() {
  const programs = data.programs_22408 || [];
  const meta = data.strict_22408_meta || {};
  const provinceSelect = document.getElementById("strict-province");
  const yearSelect = document.getElementById("strict-year");
  const modeSelect = document.getElementById("strict-mode");
  if (provinceSelect.options.length === 1) {
    [...new Set(programs.map(x => x.province))].sort((a,b) => a.localeCompare(b, "zh-CN")).forEach(value => {
      const option = node("option", "", value); option.value = value; provinceSelect.append(option);
    });
    [...new Set(programs.map(x => x.admission_year))].sort((a,b) => b-a).forEach(value => {
      const option = node("option", "", String(value)); option.value = String(value); yearSelect.append(option);
    });
    [...new Set(programs.map(x => x.study_mode))].sort((a,b) => a.localeCompare(b, "zh-CN")).forEach(value => {
      const option = node("option", "", value); option.value = value; modeSelect.append(option);
    });
  }
  document.getElementById("strict-scope-status").textContent =
    `${meta.status || "持续核验中"}。范围：${meta.scope || "见方法说明"}。截止 ${meta.last_verified_at || "—"}。`;
  const summary = document.getElementById("strict-summary");
  summary.replaceChildren();
  [
    [meta.verified_school_count || 0, "所学校已有官方科目证据"],
    [meta.verified_program_unit_count || 0, "个培养单位/专业/方式组合"],
    [meta.program_units_with_department_cutoff || 0, "个项目已有学院复试线"],
    [meta.program_units_with_ratio_evidence || 0, "个项目已有比例证据"]
  ].forEach(([value, label]) => {
    const card = node("div", "history-stat"); card.append(node("strong", "", value), node("span", "", label)); summary.append(card);
  });
  const cutoffRows = programs.flatMap(p => merged22408Outcomes(p.program_key)
    .filter(o => o.department_reexam_line !== null && o.department_reexam_line !== undefined)
    .map(o => ({school:p.school_name, code:p.program_code, line:o.department_reexam_line, year:o.year})));
  const high = [...cutoffRows].sort((a,b) => b.line-a.line).slice(0,4)
    .map(x => `${x.school}${x.code}（${x.year}）${x.line}`).join("；");
  document.getElementById("strict-analysis").textContent = cutoffRows.length
    ? `已核验项目中，较高的学院复试线包括：${high}。这只是进入复试门槛，不等于录取最低分；复试名单和拟录取名单仍需继续结构化。`
    : "当前尚无可复核的学院复试线。";
  const query = document.getElementById("strict-search").value.trim().toLowerCase();
  const province = provinceSelect.value, year = yearSelect.value, mode = modeSelect.value;
  const outcomeOnly = document.getElementById("strict-outcome-only").checked;
  const rows = programs.filter(item => {
    const haystack = `${item.school_name} ${item.department} ${item.program_code} ${item.program_name}`.toLowerCase();
    const outcomes = merged22408Outcomes(item.program_key);
    return (!query || haystack.includes(query))
      && (province === "all" || item.province === province)
      && (year === "all" || String(item.admission_year) === year)
      && (mode === "all" || item.study_mode === mode)
      && (!outcomeOnly || outcomes.some(o => o.department_reexam_line !== null || o.ratio_value !== null));
  }).sort((a,b) => a.school_name.localeCompare(b.school_name,"zh-CN") || a.department.localeCompare(b.department,"zh-CN") || a.program_code.localeCompare(b.program_code));
  const tbody = document.querySelector("#strict-table tbody"); tbody.replaceChildren();
  rows.forEach(item => {
    const outcomes = merged22408Outcomes(item.program_key);
    const latest = outcomes[0] || {};
    const tr = node("tr");
    const school = node("td", "program-cell");
    school.append(node("strong", "", item.school_name), node("span", "", `${item.department} · ${item.institution_scope}`));
    const program = node("td", "program-cell");
    program.append(node("strong", "", item.program_code), node("span", "", item.program_name));
    const plan = node("td", "history-cell");
    plan.append(node("strong", "", item.unified_exam_plan === null ? "统考待核验" : `统考 ${item.unified_exam_plan}`),
      node("span", "", item.catalog_plan_total === null ? "总计划待核验" : `总计 ${item.catalog_plan_total} · 推免 ${nullableMetric(item.recommendation_exempt)}`));
    const basic = node("td", latest.school_basic_line == null && latest.national_line == null ? "missing-value" : "");
    basic.textContent = latest.school_basic_line != null ? `学校 ${latest.school_basic_line}` :
      latest.national_line != null ? `国家 ${latest.national_line}` : "待核验";
    const cutoff = node("td", latest.department_reexam_line == null ? "missing-value" : "score-cell",
      latest.department_reexam_line == null ? "待核验" : `${latest.department_reexam_line}（${latest.year}）`);
    const ratio = node("td", "history-cell");
    if (latest.ratio_value != null) {
      ratio.append(node("strong", "", `${latest.ratio_kind || "比例"} ${latest.ratio_value}:1`),
        node("span", "", latest.ratio_scope || ""));
    } else ratio.append(node("span", "missing-value", "待核验"));
    const source = node("td");
    source.append(sourceLink(item.source_url, "官方目录"));
    if (latest.source_url && latest.source_url !== item.source_url) source.append(document.createElement("br"), sourceLink(latest.source_url, "复试/统计"));
    [school, node("td","",item.admission_year), program, node("td","",item.study_mode),
      node("td","subject-code",item.subject_codes), plan, basic, cutoff, ratio, source].forEach(td => tr.append(td));
    if (item.notes || latest.caveat) {
      tr.title = [item.notes, latest.caveat].filter(Boolean).join("；");
    }
    tbody.append(tr);
  });
  document.getElementById("strict-heading").dataset.count = String(rows.length);
}

function renderHistoricalFacts() {
  const programIds = new Set(historicalFacts.map(item => item.program_id));
  Object.keys(data.admissions || {}).forEach(id => programIds.add(id));
  data.distributions.forEach(item => programIds.add(item.program_id));
  const schoolIds = new Set([...programIds].map(id => byId.get(id)?.school_id).filter(Boolean));
  const cutoffs = historicalFacts.filter(item => item.reexam_cutoff !== null).sort((a, b) => b.reexam_cutoff - a.reexam_cutoff);
  const quotaRows = historicalFacts.filter(item => item.unified_exam_plan !== null).sort((a, b) => a.unified_exam_plan - b.unified_exam_plan);
  const cards = [
    [schoolIds.size, "所学校有结构化历史数据"],
    [programIds.size, "个候选项目可直接对照"],
    [cutoffs.length ? `${cutoffs.at(-1).reexam_cutoff}–${cutoffs[0].reexam_cutoff}` : "—", "2026 已核验复试线区间"],
    [quotaRows.length ? quotaRows[0].unified_exam_plan : "—", "最低明确统考名额"]
  ];
  const summary = document.getElementById("history-summary");
  cards.forEach(([value, label]) => {
    const card = node("div", "history-stat"); card.append(node("strong", "", value), node("span", "", label)); summary.append(card);
  });
  const topLines = cutoffs.slice(0, 5).map(item => `${item.school_name}${item.program_code}：${item.reexam_cutoff}`).join("；");
  const tightPlans = quotaRows.slice(0, 3).map(item => `${item.school_name}${item.program_code}：${item.unified_exam_plan}`).join("；");
  document.getElementById("history-analysis").textContent =
    `怎么读：当前高位复试线包括 ${topLines}。明确统考名额较紧的项目包括 ${tightPlans}。复试线只是进入复试门槛，名额口径也可能含专项或推免，不能直接换算录取概率。`;
  const tbody = document.querySelector("#history-table tbody");
  [...historicalFacts].sort((a, b) => (b.reexam_cutoff ?? -1) - (a.reexam_cutoff ?? -1) || a.school_name.localeCompare(b.school_name, "zh-CN")).forEach(item => {
    const tr = node("tr");
    const planText = item.unified_exam_plan !== null ? `统考 ${item.unified_exam_plan}` :
      item.plan_total !== null ? `总计划 ${item.plan_total}` : "—";
    const exemptText = item.recommendation_exempt !== null ? `推免 ${item.recommendation_exempt}` : "";
    [
      item.school_name, `${item.program_code} · ${item.program_name}`, item.study_scope,
      item.reexam_cutoff ?? "—", [planText, exemptText].filter(Boolean).join(" · "), item.notes
    ].forEach(value => tr.append(node("td", "", value)));
    const sourceTd = node("td"); sourceTd.append(sourceLink(item.source_url, "官方公告")); tr.append(sourceTd);
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
renderStrict22408(); renderHistoricalFacts(); renderNjupt(); renderDistributions(); renderAudit();
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

["strict-province","strict-year","strict-mode"].forEach(id => document.getElementById(id).addEventListener("change", renderStrict22408));
document.getElementById("strict-search").addEventListener("input", renderStrict22408);
document.getElementById("strict-outcome-only").addEventListener("change", renderStrict22408);
