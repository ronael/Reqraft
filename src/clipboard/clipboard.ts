import clipboard from "clipboardy";

export async function readClipboard(): Promise<string> {
  try {
    const content = await clipboard.read();
    return content.trim();
  } catch (error) {
    throw new Error(
      `Impossible de lire le presse-papiers : ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function writeClipboard(text: string): Promise<void> {
  try {
    await clipboard.write(text);
    const persistedText = await clipboard.read();
    if (persistedText !== text) {
      throw new Error("la vérification du contenu a échoué");
    }
  } catch (error) {
    throw new Error(
      `Impossible d'écrire dans le presse-papiers : ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
