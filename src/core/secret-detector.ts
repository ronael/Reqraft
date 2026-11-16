export interface SecretMatch {
  type: string;
  pattern: string;
  position: number;
  value: string;
}

/**
 * An AWS secret access key after the label it is published under:
 * `aws_secret_access_key = …`, `AWS_SECRET_ACCESS_KEY=…`,
 * `"SecretAccessKey": "…"`, `secretAccessKey: '…'`. The label is enough
 * proof, so the 40 characters may be anything a key holds. The quotes and
 * spaces around the separator are bounded, which keeps the look-behind linear.
 */
const LABELLED_AWS_SECRET_KEY =
  /(?<=secret_?access_?key["' \t]{0,4}[:=]["' \t]{0,4})[a-z\d/+]{40}(?![a-z\d/+])/gi;

/**
 * An AWS secret access key on its own: exactly 40 base64 characters, with
 * upper case, lower case and a digit, as a random key has.
 *
 * The run must stand alone, which rules out any 40 characters taken from a
 * longer path, URL or base64 blob. The mix rules out a git SHA (lower-case
 * hex) and the paths and identifiers that hold no digit. A key with no digit
 * (about one in nine hundred) is still caught under its label, above.
 */
const BARE_AWS_SECRET_KEY =
  /(?<![A-Za-z0-9/+])(?=[A-Za-z0-9/+]{0,39}[A-Z])(?=[A-Za-z0-9/+]{0,39}[a-z])(?=[A-Za-z0-9/+]{0,39}\d)[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+])/g;

/** From the most precise pattern to the most generic: `detectSecrets` relies on this order. */
const SECRET_PATTERNS: { type: string; regex: RegExp }[] = [
  { type: "GitHub token", regex: /gh[pousr]_\w{36,}/g },
  { type: "OpenAI API key", regex: /sk-[a-zA-Z0-9]{48}/g },
  { type: "Anthropic API key", regex: /sk-ant-[a-zA-Z0-9_-]{32,}/g },
  { type: "AWS access key", regex: /AKIA[0-9A-Z]{16}/g },
  { type: "AWS secret key", regex: LABELLED_AWS_SECRET_KEY },
  { type: "AWS secret key", regex: BARE_AWS_SECRET_KEY },
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

/** Each kind of secret the input holds, once, however many share it. */
export function detectSecretKinds(input: string): string[] {
  return [...new Set(detectSecrets(input).map((secret) => secret.type))];
}
