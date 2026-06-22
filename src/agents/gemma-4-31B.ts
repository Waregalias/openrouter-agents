import {OpenRouter} from '@openrouter/agent';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import inquirer from 'inquirer';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const run = async () => {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
        console.error("Erreur : La variable d'environnement OPENROUTER_API_KEY n'est pas définie.");
        console.log("Veuillez créer un fichier .env à la racine avec : OPENROUTER_API_KEY=votre_clef");
        return;
    }

    // Chemin du fichier à inclure
    const filePath = path.join(__dirname, '../attachments/7e919c70-977c-4004-8b0d-779d079c6555.jpg');
    const ext = path.extname(filePath).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);

    let attachmentContent: any = null;

    try {
        if (fs.existsSync(filePath)) {
            if (isImage) {
                const fileBuffer = fs.readFileSync(filePath);
                const base64 = fileBuffer.toString('base64');
                const mimeType = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
                // Utilisation du type exact attendu par le SDK @openrouter/agent : NewUserMessageItem['content']
                attachmentContent = {
                    type: "input_image",
                    imageUrl: `data:${mimeType};base64,${base64}`,
                    detail: "auto"
                };
                console.log(`Image détectée : ${path.basename(filePath)}`);
            } else {
                const textContent = fs.readFileSync(filePath, 'utf-8');
                attachmentContent = {
                    type: "input_text",
                    text: `Contenu du fichier ${path.basename(filePath)} :\n\n\`\`\`${ext.replace('.', '')}\n${textContent}\n\`\`\``
                };
                console.log(`Fichier texte détecté : ${path.basename(filePath)}`);
            }
        } else {
            console.warn(`Note : Le fichier ${filePath} n'a pas été trouvé. L'agent sera lancé sans pièce jointe.`);
        }
    } catch (err: any) {
        console.error(`Erreur lors de la lecture du fichier : ${err.message}`);
    }

    // Demander la question à l'utilisateur
    const {userQuestion} = await inquirer.prompt([
        {
            type: 'input',
            name: 'userQuestion',
            message: 'Quelle est votre question sur ce contenu ?',
            default: 'Peux-tu me faire une analyse détaillée de ce contenu ?',
        },
    ]);

    // Initialisation du client OpenRouter avec la librairie officielle
    const client = new OpenRouter({
        apiKey: apiKey,
    });

    console.log("\nAppel de l'agent Gemma 4 31B via @openrouter/agent...");

    try {
        // Construction de l'input dynamique. 
        // D'après l'erreur Zod, l'API Responses attend soit une string, soit un tableau d'items spécifiques.
        // On va passer directement le contenu sous forme de message utilisateur.
        const input: any = [
            {
                role: "user",
                content: [
                    {
                        type: "input_text",
                        text: userQuestion
                    },
                    ...(attachmentContent ? [attachmentContent] : [])
                ]
            }
        ];

        // Utilisation de client.callModel
        const result = client.callModel({
            model: "google/gemma-4-31b-it:free",
            input: input,
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
