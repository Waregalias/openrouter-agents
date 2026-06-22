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

    // Répertoire des pièces jointes spécifique à cet agent
    const agentName = path.basename(__filename, '.ts');
    const attachmentsDir = path.join(__dirname, '../attachments', agentName);
    const attachmentItems: any[] = [];

    try {
        if (fs.existsSync(attachmentsDir)) {
            const files = fs.readdirSync(attachmentsDir);
            console.log(`Dossier de pièces jointes détecté : ${attachmentsDir} (${files.length} fichiers)`);

            for (const filename of files) {
                const filePath = path.join(attachmentsDir, filename);
                if (fs.statSync(filePath).isDirectory()) continue;

                const ext = path.extname(filename).toLowerCase();
                const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);

                if (isImage) {
                    const fileBuffer = fs.readFileSync(filePath);
                    const base64 = fileBuffer.toString('base64');
                    const mimeType = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
                    attachmentItems.push({
                        type: "input_image",
                        imageUrl: `data:${mimeType};base64,${base64}`,
                        detail: "auto"
                    });
                    console.log(`  - Image ajoutée : ${filename}`);
                } else if (['.json', '.txt', '.ts', '.js', '.md'].includes(ext)) {
                    const textContent = fs.readFileSync(filePath, 'utf-8');
                    attachmentItems.push({
                        type: "input_text",
                        text: `Contenu du fichier ${filename} :\n\n\`\`\`${ext.replace('.', '')}\n${textContent}\n\`\`\``
                    });
                    console.log(`  - Fichier texte ajouté : ${filename}`);
                }
            }
        } else {
            console.warn(`Note : Le répertoire ${attachmentsDir} n'a pas été trouvé. L'agent sera lancé sans pièces jointes.`);
        }
    } catch (err: any) {
        console.error(`Erreur lors de la lecture des pièces jointes : ${err.message}`);
    }

    // Demander la question à l'utilisateur
    const {userQuestion} = await inquirer.prompt([
        {
            type: 'input',
            name: 'userQuestion',
            message: 'Quelle est votre question sur ces documents ?',
            default: 'Peux-tu me faire une synthèse de ces documents ?',
        },
    ]);

    // Initialisation du client OpenRouter avec la librairie officielle
    const client = new OpenRouter({
        apiKey: apiKey,
    });

    console.log("\nAppel de l'agent Gemma 4 31B via @openrouter/agent...");

    try {
        // Construction de l'input dynamique avec tous les fichiers
        const input: any = [
            {
                role: "user",
                content: [
                    {
                        type: "input_text",
                        text: userQuestion
                    },
                    ...attachmentItems
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
        console.error("\nErreur lors de l'appel à OpenRouter :");
        
        // Tentative d'affichage détaillé de l'erreur (notamment pour le rate-limit 429)
        if (error.error) {
            const details = error.error;
            console.error(`Code : ${details.code}`);
            console.error(`Message : ${details.message}`);
            if (details.metadata && details.metadata.raw) {
                console.error(`Détails du fournisseur : ${details.metadata.raw}`);
            }
        } else {
            console.error(error.message);
        }
        
        // Affichage de l'objet complet en cas de besoin pour le debug
        if (process.env.DEBUG) {
            console.error(JSON.stringify(error, null, 2));
        }
    }
};
