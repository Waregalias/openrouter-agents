import { compress } from 'headroom-ai';

/**
 * Intégration Headroom (https://github.com/headroomlabs-ai/headroom).
 *
 * Headroom compresse le contexte (texte, fichiers, logs...) avant qu'il
 * n'atteigne le LLM, ce qui réduit fortement la consommation de tokens.
 *
 * IMPORTANT : le package npm `headroom-ai` est un CLIENT du proxy Headroom.
 * La compression réelle est effectuée par le proxy local, à lancer séparément :
 *
 *     pip install "headroom-ai[all]"
 *     headroom proxy --port 8787
 *
 * Si le proxy n'est pas joignable, `compress` renvoie le contenu intact
 * (fallback) : l'agent continue donc de fonctionner normalement, sans gain.
 *
 * Activation : DÉSACTIVÉE par défaut (compression « lossy » — voir README).
 * Activer explicitement avec HEADROOM_ENABLED=1. URL du proxy : HEADROOM_BASE_URL.
 */

/** La compression est-elle activée ? (opt-in : HEADROOM_ENABLED=1 pour l'activer) */
function isEnabled(): boolean {
    const flag = process.env.HEADROOM_ENABLED?.toLowerCase();
    return flag === '1' || flag === 'true' || flag === 'on';
}

/**
 * Taille minimale (en caractères) des pièces jointes texte à partir de laquelle
 * on tente la compression. En-dessous, le gain est négligeable et le risque
 * d'élaguer une info importante n'en vaut pas la peine → on laisse intact.
 * Réglable via HEADROOM_MIN_CHARS (défaut : 8000 ≈ 2000 tokens).
 */
function minChars(): number {
    const n = Number(process.env.HEADROOM_MIN_CHARS);
    return Number.isFinite(n) && n > 0 ? n : 8000;
}

/**
 * Sépare le contenu OpenRouter en trois groupes :
 *  - question  : la requête de l'utilisateur (1er input_text) — JAMAIS compressée
 *  - textAtt   : pièces jointes texte (fichiers) — candidates à la compression
 *  - images    : pièces jointes image — transmises telles quelles
 *
 * Headroom protège systématiquement les messages de rôle `user`
 * (`router:protected:user_message`). On ne compresse donc que les pièces
 * jointes, en les présentant au compresseur comme du contexte (rôle non-user),
 * tout en gardant la question intacte.
 */
function splitContent(content: any[]): { question: any[]; textAtt: any[]; images: any[] } {
    const question: any[] = [];
    const textAtt: any[] = [];
    const images: any[] = [];
    let questionTaken = false;

    for (const p of content) {
        if (p.type === 'input_image') {
            images.push(p);
        } else if (p.type === 'input_text') {
            if (!questionTaken) {
                question.push(p); // 1er texte = question de l'utilisateur
                questionTaken = true;
            } else {
                textAtt.push(p); // textes suivants = pièces jointes
            }
        } else {
            images.push(p); // type inconnu : on le laisse passer tel quel
        }
    }
    return { question, textAtt, images };
}

/** Extrait le texte d'un message OpenAI (content string ou tableau de parts). */
function extractText(msg: any): string[] {
    const content = msg?.content;
    if (typeof content === 'string') return content ? [content] : [];
    if (!Array.isArray(content)) return [];
    return content
        .filter((p: any) => p?.type === 'text' && typeof p.text === 'string')
        .map((p: any) => p.text);
}

/**
 * Compresse les pièces jointes du message utilisateur via Headroom avant
 * l'envoi au modèle. La question de l'utilisateur et les images sont préservées
 * telles quelles. Tolérant aux pannes : en cas d'erreur, de proxy indisponible
 * ou d'absence de pièces jointes, le contenu original est renvoyé tel quel.
 *
 * @param content Contenu au format OpenRouter (tableau d'input_text/input_image)
 * @param model   Identifiant du modèle cible (aide Headroom à calibrer le budget)
 * @returns       Le contenu (pièces jointes compressées si possible)
 */
export async function compressContent(content: any[], model: string): Promise<any[]> {
    if (!isEnabled()) {
        return content;
    }

    const { question, textAtt, images } = splitContent(content);

    // Rien à compresser (pas de pièce jointe texte) → on renvoie l'original.
    if (textAtt.length === 0) {
        return content;
    }

    // Garde-fou : on ne compresse que les pièces jointes volumineuses.
    const totalChars = textAtt.reduce((n, p) => n + (p.text?.length ?? 0), 0);
    if (totalChars < minChars()) {
        return content;
    }

    try {
        // On présente les pièces jointes comme du contexte (rôle assistant) pour
        // que le routeur Headroom les compresse, et la question comme message
        // user (protégée). L'ordre [contexte, question] reflète une conversation.
        // IMPORTANT : le `content` doit être une CHAÎNE (et non un tableau de
        // parts) — le routeur Headroom ne déclenche SmartCrusher/Kompress que
        // sur du contenu string.
        const attachmentText = textAtt.map((p) => p.text).join('\n\n');
        const questionText = question.map((p) => p.text).join('\n\n');
        const messages = [
            { role: 'assistant', content: attachmentText },
            { role: 'user', content: questionText },
        ];

        const result = await compress(messages, {
            model,
            stack: 'adapter_ts_openrouter',
        });

        if (result.compressed && result.tokensSaved > 0) {
            const pct = Math.round((1 - result.tokensAfter / result.tokensBefore) * 100);
            console.log(
                `  - Headroom : ${result.tokensBefore} → ${result.tokensAfter} tokens ` +
                `(-${result.tokensSaved}, soit ${pct}% économisés) ` +
                `[${result.transformsApplied.join(', ') || 'n/a'}]`
            );

            // On récupère le contexte compressé (messages de rôle non-user).
            const compressedAtt = result.messages
                .filter((m: any) => m?.role !== 'user')
                .flatMap((m: any) => extractText(m))
                .map((text: string) => ({ type: 'input_text', text }));

            // Réassemblage : question intacte + pièces jointes compressées + images.
            return [...question, ...compressedAtt, ...images];
        }

        console.log('  - Headroom : pas de compression (proxy indisponible ou pièces jointes trop courtes).');
        return content;
    } catch (err: any) {
        console.warn(`  - Headroom désactivé (erreur) : ${err?.message ?? err}`);
        return content;
    }
}
