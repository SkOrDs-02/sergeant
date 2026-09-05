// Status: Active — незмінні спроби та контекст порівняння.
import { isDeepStrictEqual } from "node:util";
import { evidenceProblem, latest, outcome } from "./schema.mjs";
const safe = (value) =>
  String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
const header = (title) => ["<!-- AUTO-GENERATED -->", `# ${title}`, ""];
export function report(run, registry, root) {
  const last = latest(run),
    lines = header(`Прогін ${run.id}`);
  lines.push(
    `Статус: ${run.status}; outcome: ${outcome(run)}; тип: ${run.kind}.`,
    "",
    "## Контекст",
    "",
    "```json",
    JSON.stringify(run.metadata, null, 2),
    "```",
    "",
    "## Покриття за останніми спробами",
    "",
    "| Сценарій | Ревізія | Статус | Знахідки |",
    "| --- | --- | --- | --- |",
  );
  for (const s of run.scenarios) {
    const a = last.get(s.id);
    lines.push(
      `| ${s.id} | ${s.revision} | ${a?.status ?? "not-run"} | ${a?.findingIds.join(", ") ?? ""} |`,
    );
  }
  lines.push("", "## Усі спроби", "");
  for (const a of run.attempts) {
    lines.push(
      `### ${a.id} — ${a.scenarioId}: ${a.status}`,
      "",
      `Час: ${a.at}.`,
      "",
      safe(a.actual),
      "",
      `Причина: ${safe(a.reason || "—")}`,
      "",
      `Метрики: ${safe(JSON.stringify(a.metrics))}`,
      "",
    );
    for (const e of a.evidence)
      lines.push(
        `- ${safe(e.path)} (${safe(e.type)}; SHA256 ${e.sha256}): ${safe(evidenceProblem(e, root) ?? "доступний, checksum збігається")}`,
      );
  }
  if (!run.attempts.length) lines.push("Спроб немає.");
  lines.push("", "## Знахідки", "");
  const linked = new Set(run.attempts.flatMap((a) => a.findingIds));
  for (const f of registry.findings.filter((f) => linked.has(f.id)))
    lines.push(
      `- ${f.id}: ${safe(f.title)} — ${f.status}; ${safe(f.severity)}; джерело ${safe(f.source)}.`,
    );
  if (!linked.size) lines.push("Пов’язаних знахідок немає.");
  lines.push("", "## Решта роботи", "");
  const remaining = run.scenarios.filter(
    (s) => !["pass", "not-applicable"].includes(last.get(s.id)?.status),
  );
  remaining.forEach((s) =>
    lines.push(
      `- ${s.id}: ${last.get(s.id)?.status ?? "not-run"} — ${safe(s.title)}`,
    ),
  );
  if (!remaining.length)
    lines.push(
      "За останніми спробами пропусків немає; це не замінює перевірку доступності доказів.",
    );
  return lines.join("\n");
}
function differences(a, b, prefix = "metadata") {
  if (isDeepStrictEqual(a, b)) return [];
  if (
    a &&
    b &&
    typeof a === "object" &&
    typeof b === "object" &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  )
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) =>
      differences(a[k], b[k], `${prefix}.${k}`),
    );
  return [
    `${prefix}: ${JSON.stringify(a) ?? "(missing)"} → ${JSON.stringify(b) ?? "(missing)"}`,
  ];
}
export function compare(before, after, root) {
  const lines = header(`Порівняння ${before.id} → ${after.id}`),
    changes = differences(before.metadata, after.metadata);
  if (before.kind !== after.kind)
    changes.unshift(`kind: ${before.kind} → ${after.kind}`);
  lines.push("## Контекст", "");
  if (changes.length) {
    lines.push(
      "Обмеження порівнянності: контекст відрізняється. Зміна статусу сама по собі не доводить причину поліпшення.",
      "",
    );
    changes.forEach((x) => lines.push(`- ${safe(x)}`));
  } else lines.push("Контекст збігається.");
  const x = latest(before),
    y = latest(after),
    b = new Map(before.scenarios.map((s) => [s.id, s])),
    a = new Map(after.scenarios.map((s) => [s.id, s]));
  lines.push("", "## Сценарії", "");
  for (const key of new Set([...b.keys(), ...a.keys()])) {
    if (!b.has(key)) {
      lines.push(`- ${key}: новий; ${y.get(key)?.status ?? "not-run"}`);
      continue;
    }
    if (!a.has(key)) {
      lines.push(
        `- ${key}: вилучений; раніше ${x.get(key)?.status ?? "not-run"}`,
      );
      continue;
    }
    if (
      b.get(key).revision !== a.get(key).revision ||
      !isDeepStrictEqual(b.get(key), a.get(key))
    ) {
      lines.push(
        `- ${key}: незіставний snapshot/revision (${b.get(key).revision} → ${a.get(key).revision})`,
      );
      continue;
    }
    const p = x.get(key),
      q = y.get(key);
    if (
      !p ||
      !q ||
      ["blocked", "not-run"].includes(p.status) ||
      ["blocked", "not-run"].includes(q.status)
    ) {
      lines.push(
        `- ${key}: не виконано/заблоковано; ${p?.status ?? "not-run"} → ${q?.status ?? "not-run"}`,
      );
      continue;
    }
    let label = "зміна статусу";
    if (before.kind !== after.kind)
      label = "незіставні live/demo, висновок про поліпшення відсутній";
    else if (p.status === "pass" && q.status === "fail")
      label = p.findingIds.some((f) => q.findingIds.includes(f))
        ? "повторно відкрито"
        : "регресія";
    else if (p.status === "fail" && q.status === "pass")
      label = changes.length
        ? "кандидат на поліпшення (змінений контекст)"
        : "поліпшення";
    else if (p.status === q.status) label = "без зміни";
    lines.push(`- ${key}: ${p.status} → ${q.status}; ${label}`);
    for (const metric of new Set([
      ...Object.keys(p.metrics),
      ...Object.keys(q.metrics),
    ])) {
      const v = p.metrics[metric],
        w = q.metrics[metric];
      if (typeof v === "number" && typeof w === "number")
        lines.push(
          `  - metric ${safe(metric)}: ${v} → ${w}; delta ${w - v} (без порога)`,
        );
      else if (!isDeepStrictEqual(v, w))
        lines.push(
          `  - metric ${safe(metric)}: ${safe(JSON.stringify(v) ?? "(missing)")} → ${safe(JSON.stringify(w) ?? "(missing)")}`,
        );
    }
  }
  lines.push("", "## Доступність доказів", "");
  const problems = [before, after]
    .flatMap((r) =>
      r.attempts.flatMap((at) =>
        at.evidence.map((e) => {
          const problem = evidenceProblem(e, root);
          return problem ? `${r.id}/${at.id}: ${problem}` : null;
        }),
      ),
    )
    .filter(Boolean);
  if (problems.length) problems.forEach((p) => lines.push(`- ${safe(p)}`));
  else lines.push("Усі записані докази доступні, checksum збігаються.");
  return lines.join("\n");
}
