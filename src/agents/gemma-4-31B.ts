import { OpenRouter } from '@openrouter/agent';
import dotenv from 'dotenv';

dotenv.config();

export const run = async () => {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    console.error("Erreur : La variable d'environnement OPENROUTER_API_KEY n'est pas définie.");
    console.log("Veuillez créer un fichier .env à la racine avec : OPENROUTER_API_KEY=votre_clef");
    return;
  }

  // Initialisation du client OpenRouter avec la librairie officielle
  const client = new OpenRouter({
    apiKey: apiKey,
  });

  console.log("Appel de l'agent Gemma 4 31B via @openrouter/agent...");

  try {
    // Utilisation de client.callModel (qui utilise callModel en interne)
    const result = client.callModel({
      model: "google/gemma-4-31b-it:free",
      input: "Bonjour Gemma ! Peux-tu te présenter brièvement et me confirmer que tu es bien le modèle Gemma 4 31B ?",
    });

    // Récupération du texte de la réponse
    const responseText = await result.getText();

    console.log("\nRéponse de Gemma :");
    console.log("------------------\n");
    console.log(responseText);
    console.log("\n------------------");
  } catch (error: any) {
    console.error("Erreur lors de l'appel à OpenRouter :", error.message);
  }
};
