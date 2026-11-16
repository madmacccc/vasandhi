export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let word = "";
  let triggerDepth = 0;
  let trigger = false;
  let firstWords: string[] = [];
  let quote: "'" | '"' | "`" | "]" | null = null;
  let lineComment = false;

  const flushWord = () => {
    if (!word) return;
    const token = word.toUpperCase();
    if (firstWords.length < 2) {
      firstWords.push(token);
      if (firstWords[0] === "CREATE" && firstWords[1] === "TRIGGER") trigger = true;
    }
    if (trigger) {
      if (token === "BEGIN" || token === "CASE") triggerDepth += 1;
      if (token === "END") triggerDepth -= 1;
    }
    word = "";
  };

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const next = sql[index + 1];
    if (lineComment) {
      current += character;
      if (character === "\n") lineComment = false;
      continue;
    }
    if (!quote && character === "-" && next === "-") {
      flushWord();
      current += character;
      lineComment = true;
      continue;
    }
    if (quote) {
      current += character;
      if (character === quote) {
        if (next === quote && quote !== "]") {
          current += next;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      flushWord();
      quote = character;
      current += character;
      continue;
    }
    if (character === "[") {
      flushWord();
      quote = "]";
      current += character;
      continue;
    }
    if (/[A-Za-z_]/.test(character)) {
      word += character;
      current += character;
      continue;
    }
    flushWord();
    if (character === ";" && (!trigger || triggerDepth === 0)) {
      if (current.trim()) statements.push(current.trim());
      current = "";
      trigger = false;
      triggerDepth = 0;
      firstWords = [];
      continue;
    }
    current += character;
  }
  flushWord();
  if (current.trim()) statements.push(current.trim());
  return statements;
}
