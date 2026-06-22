import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';

export interface AttachmentItem {
    type: "input_text" | "input_image";
    text?: string;
    imageUrl?: string;
    detail?: string;
}

/**
 * Prépare l'input pour un agent en gérant les pièces jointes et en posant une question.
 * @param agentName Nom de l'agent (pour trouver son dossier d'attachments)
 * @param dirname Chemin __dirname de l'agent appelant
 * @returns Un tableau de contenu prêt pour le champ 'content' d'un message utilisateur.
 */
export async function prepareAgentInput(agentName: string, dirname: string): Promise<any[]> {
    const attachmentsDir = path.join(dirname, '../attachments', agentName);
    const attachmentItems: any[] = [];

    // 1. Gestion des pièces jointes
    try {
        if (fs.existsSync(attachmentsDir)) {
            const files = fs.readdirSync(attachmentsDir);
            
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
            if (attachmentItems.length > 0) {
                console.log(`Total : ${attachmentItems.length} pièce(s) jointe(s) chargée(s).`);
            }
        }
    } catch (err: any) {
        console.error(`Erreur lors de la lecture des pièces jointes : ${err.message}`);
    }

    // 2. Question de l'utilisateur
    const { userQuestion } = await inquirer.prompt([
        {
            type: 'input',
            name: 'userQuestion',
            message: 'Quelle est votre question ?',
            default: attachmentItems.length > 0 ? 'Peux-tu me faire une synthèse de ces documents ?' : 'Bonjour !',
        },
    ]);

    // 3. Construction du contenu final
    return [
        {
            type: "input_text",
            text: userQuestion
        },
        ...attachmentItems
    ];
}
