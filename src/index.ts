import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const agentsDir = path.join(__dirname, 'agents');

  if (!fs.existsSync(agentsDir)) {
    console.error("Le répertoire 'agents' n'existe pas dans 'src/'.");
    return;
  }

  const files = fs.readdirSync(agentsDir).filter(file => file.endsWith('.ts') || file.endsWith('.js'));

  if (files.length === 0) {
    console.log("Aucun script trouvé dans le répertoire 'agents'.");
    return;
  }

  const { selectedScript } = await inquirer.prompt([
    {
      type: 'select',
      name: 'selectedScript',
      message: 'Quel script souhaitez-vous lancer ?',
      choices: files,
    },
  ]);

  const scriptPath = path.join(agentsDir, selectedScript);
  
  try {
    // Utilisation de l'import dynamique pour charger le script sélectionné
    const module = await import(`file://${scriptPath}`);
    if (module.run && typeof module.run === 'function') {
      await module.run();
    } else {
      console.error(`Le script ${selectedScript} n'exporte pas de fonction 'run'.`);
    }
  } catch (error) {
    console.error(`Erreur lors de l'exécution du script ${selectedScript}:`, error);
  }
}

main();