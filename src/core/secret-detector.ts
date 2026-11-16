export interface SecretMatch {
  type: string;
  pattern: string;
  position: number;
  value: string;
}

/** From the most precise pattern to the most generic: `detectSecrets` relies on this order. */
const SECRET_PATTERNS: { type: string; regex: RegExp }[] = [
  { type: "GitHub token", regex: /gh[pousr]_\w{36,}/g },
  { type: "OpenAI API key", regex: /sk-[a-zA-Z0-9]{48}/g },
  { type: "Anthropic API key", regex: /sk-ant-[a-zA-Z0-9_-]{32,}/g },
  { type: "AWS access key", regex: /AKIA[0-9A-Z]{16}/g },
  { type: "AWS secret key", regex: /[0-9a-zA-Z/+]{40}/g },
  { type: "private key", regex: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
  { type: "generic secret", regex: /\b(SECRET|TOKEN|PASSWORD|API_KEY)\s*=\s*['"]?[^\s'"]+['"]?/gi },
];

/**
 * The secrets the input holds, in pattern order.
 *
 * A match that lies entirely inside the match of an earlier, more precise
 * pattern is the same secret seen less precisely, such as the AWS-shaped run
 * inside an Anthropic or OpenAI key, and is left out. Partial overlaps stay,
 * and so does a generic match holding a precise one: `API_KEY=sk-ant-…` names
 * both the Anthropic key and the generic secret.
 */
export function detectSecrets(input: string): SecretMatch[] {
  const matches: SecretMatch[] = [];

  for (const { type, regex } of SECRET_PATTERNS) {
    for (const match of input.matchAll(regex)) {
      const found: SecretMatch = {
        type,
        pattern: regex.source,
        position: match.index,
        value: match[0],
      };
      // Matches of one pattern never overlap, so only an earlier pattern's
      // match can hold this one.
      if (!matches.some((earlier) => contains(earlier, found))) {
        matches.push(found);
      }
    }
  }

  return matches;
}

function contains(outer: SecretMatch, inner: SecretMatch): boolean {
  return (
    outer.position <= inner.position &&
    inner.position + inner.value.length <= outer.position + outer.value.length
  );
}

export function hasSecrets(input: string): boolean {
  return detectSecrets(input).length > 0;
}
