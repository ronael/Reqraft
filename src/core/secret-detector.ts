export interface SecretMatch {
  type: string;
  pattern: string;
  position: number;
  value: string;
}

const SECRET_PATTERNS: { type: string; regex: RegExp }[] = [
  { type: "GitHub token", regex: /gh[pousr]_\w{36,}/g },
  { type: "OpenAI API key", regex: /sk-[a-zA-Z0-9]{48}/g },
  { type: "Anthropic API key", regex: /sk-ant-[a-zA-Z0-9_-]{32,}/g },
  { type: "AWS access key", regex: /AKIA[0-9A-Z]{16}/g },
  { type: "AWS secret key", regex: /[0-9a-zA-Z/+]{40}/g },
  { type: "private key", regex: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
  { type: "generic secret", regex: /\b(SECRET|TOKEN|PASSWORD|API_KEY)\s*=\s*['"]?[^\s'"]+['"]?/gi },
];

export function detectSecrets(input: string): SecretMatch[] {
  const matches: SecretMatch[] = [];

  for (const { type, regex } of SECRET_PATTERNS) {
    for (const match of input.matchAll(regex)) {
      matches.push({
        type,
        pattern: regex.source,
        position: match.index,
        value: match[0],
      });
    }
  }

  return matches;
}

export function hasSecrets(input: string): boolean {
  return detectSecrets(input).length > 0;
}
