import {OpenRouter} from '@openrouter/agent';
import dotenv from 'dotenv';
import path from 'path';
import {fileURLToPath} from 'url';
import inquirer from 'inquirer';
import {prepareAgentInput} from '../utils/agent-utils.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODELS = [
    { name: "google/gemma-4-31b-it:free (text, image, video)", value: "google/gemma-4-31b-it:free" },
    { name: "google/gemma-4-26b-a4b-it:free (text, image, video)", value: "google/gemma-4-26b-a4b-it:free" },
    { name: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free (text, image, video, audio)", value: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free" },
    { name: "nvidia/nemotron-3-ultra-550b-a55b:free (text)", value: "nvidia/nemotron-3-ultra-550b-a55b:free" },
    { name: "nvidia/nemotron-3-super-120b-a12b:free (text)", value: "nvidia/nemotron-3-super-120b-a12b:free" },
    { name: "nex-agi/nex-n2-pro:free (text, image)", value: "nex-agi/nex-n2-pro:free" },
    { name: "poolside/laguna-m.1:free (text)", value: "poolside/laguna-m.1:free" },
    { name: "poolside/laguna-xs.2:free (text)", value: "poolside/laguna-xs.2:free" },
    { name: "openai/gpt-oss-120b:free (text)", value: "openai/gpt-oss-120b:free" },
    { name: "cohere/north-mini-code:free (text)", value: "cohere/north-mini-code:free" },
    { name: "liquid/lfm-2.5-1.2b-thinking:free (text)", value: "liquid/lfm-2.5-1.2b-thinking:free" },
    { name: "liquid/lfm-2.5-1.2b-instruct:free (text)", value: "liquid/lfm-2.5-1.2b-instruct:free" },
    { name: "qwen/qwen3-next-80b-a3b-instruct:free (text)", value: "qwen/qwen3-next-80b-a3b-instruct:free" },
    { name: "qwen/qwen3-coder:free (text)", value: "qwen/qwen3-coder:free" },
    { name: "meta-llama/llama-3.3-70b-instruct:free (text)", value: "meta-llama/llama-3.3-70b-instruct:free" },
];

export const run = async () => {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
        console.error("Erreur : La variable d'environnement OPENROUTER_API_KEY n'est pas définie.");
        console.log("Veuillez créer un fichier .env à la racine avec : OPENROUTER_API_KEY=votre_clef");
        return;
    }

    // 1. Choix du modèle
    const {selectedModel} = await inquirer.prompt([
        {
            type: 'select',
            name: 'selectedModel',
            message: 'Quel modèle souhaitez-vous utiliser ?',
            choices: MODELS,
        },
    ]);

    // 2. Préparation générique de l'input (pièces jointes + question)
    // On utilise le nom de l'agent "open-router" pour le dossier des attachments
    const agentName = path.basename(__filename, '.ts');
    const content = await prepareAgentInput(agentName, __dirname);

    // Initialisation du client OpenRouter
    const client = new OpenRouter({
        apiKey: apiKey,
    });

    console.log(`\nAppel de l'agent via OpenRouter (Modèle: ${selectedModel})...`);

    try {
        const input: any = [
            {
                role: "user",
                content: content
            }
        ];

        const result = client.callModel({
            model: selectedModel,
            input: input,
        });

        const responseText = await result.getText();

        console.log(`\nRéponse de ${selectedModel} :`);
        console.log("------------------\n");
        console.log(responseText);
        console.log("\n------------------");
    } catch (error: any) {
        console.error("\nErreur lors de l'appel à OpenRouter :");
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
    }
};
