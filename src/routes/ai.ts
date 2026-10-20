import { Router, Response } from 'express';
import { AuthenticatedRequest, authenticateToken } from '../middleware/auth.js';

const router = Router();

// Protect all AI routes with user token authentication
router.use(authenticateToken);

interface AiAssistRequestBody {
  prompt?: string;
  command?: string;
  context?: string;
  userName?: string;
  partnerName?: string;
  spaceName?: string;
}

function cleanTags(str: string): string {
  if (!str) return '';
  return str
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\[\/?(CONVERSATION|COPYABLE|THINK|REASONING)\]/gi, '')
    .trim();
}

function parseEmaOutput(raw: string) {
  const cleaned = (raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Extract tagged sections if model adhered to [CONVERSATION] and [COPYABLE]
  const convMatch = cleaned.match(/\[CONVERSATION\]([\s\S]*?)(?:\[\/CONVERSATION\]|$)/i);
  const copyMatch = cleaned.match(/\[COPYABLE\]([\s\S]*?)(?:\[\/COPYABLE\]|$)/i);

  let intro = convMatch ? cleanTags(convMatch[1]) : '';
  let copyable = copyMatch ? cleanTags(copyMatch[1]) : '';

  if (copyable) {
    return { intro, copyable, fullText: cleanTags(cleaned) };
  }

  // If only [CONVERSATION] was provided (e.g. greeting or direct answer)
  if (convMatch && !copyMatch) {
    return { intro: cleanTags(convMatch[1]), copyable: '', fullText: cleanTags(convMatch[1]) };
  }

  // Fallback heuristic if tags were completely omitted
  const colonSplit = cleaned.split(/:\s*\n+/);
  if (colonSplit.length > 1 && colonSplit[0].length < 120 && !colonSplit[0].includes('\n')) {
    intro = cleanTags(colonSplit[0]);
    copyable = cleanTags(colonSplit.slice(1).join('\n\n'));
    return { intro, copyable, fullText: cleanTags(cleaned) };
  }

  const quoteMatch = cleaned.match(/^([^\n"]+[:!])?\s*["“]([\s\S]+?)["”]\s*$/);
  if (quoteMatch && quoteMatch[2]) {
    intro = cleanTags(quoteMatch[1] || '');
    copyable = cleanTags(quoteMatch[2]);
    return { intro, copyable, fullText: cleanTags(cleaned) };
  }

  // Default: Treat untagged response as conversational with no copy box
  return { intro: cleanTags(cleaned), copyable: '', fullText: cleanTags(cleaned) };
}

router.post('/assist', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      prompt = '',
      command = '',
      userName = '',
      partnerName = '',
      spaceName = '',
    }: AiAssistRequestBody = req.body;

    const userText = (command || prompt || '').trim();
    if (!userText) {
      res.status(400).json({ error: 'Please provide what you would like Ema to write or help with.' });
      return;
    }

    const freeLlmBaseUrl = (process.env.FREELLMAPI_URL || 'http://localhost:3001/v1').replace(/\/+$/, '');
    const freeLlmApiKey = process.env.FREELLMAPI_KEY || '';
    const freeLlmModel = process.env.FREELLMAPI_MODEL || 'auto';

    const openRouterApiKey = process.env.OPENROUTER_API_KEY || '';
    const openRouterModel = process.env.OPENROUTER_MODEL || 'openrouter/free';

    const senderName = userName || req.user?.name || 'You';
    const partner = partnerName || 'your partner';
    const sanctuary = spaceName || 'your private sanctuary';

    const systemPrompt = `You are Ema, a polite, executive, and attentive AI companion for couples in their Heartly private sanctuary.
You are currently assisting ${senderName}.
Their beloved partner is ${partner}.
Their private couple space is named "${sanctuary}".

CORE DIRECTIVES (STRICT & MANDATORY):
1. Answer minimally and in a polite, executive manner with no unwanted elaborations.
2. Just answer for what is asked, or just do what is asked to be done.
3. Zero fluff, zero unsolicited relationship lectures, zero repetitive filler, and zero long introductory speeches.
4. Output Format:
   - When asked to craft, generate, or provide any requested written expression or content:
[CONVERSATION]
At most 1 short polite sentence (or leave blank).
[/CONVERSATION]
[COPYABLE]
The exact requested expression, with no surrounding commentary or introductory phrases.
[/COPYABLE]

   - When asked any question, greeting, or conversational query:
[CONVERSATION]
Direct, minimal, polite answer.
[/CONVERSATION]

5. Never output internal reasoning, planning steps, or meta-commentary.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText },
    ];

    // Primary: Try FreeLLMAPI first
    let primarySuccess = false;
    let rawOutput = '';
    let usedModel = '';
    let provider = 'freellmapi';
    let primaryErrorMsg = '';

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const targetUrl = `${freeLlmBaseUrl}/chat/completions`;
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freeLlmApiKey}`,
        },
        body: JSON.stringify({
          model: freeLlmModel,
          messages,
          temperature: 0.75,
          max_tokens: 1200,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        const data: any = await response.json();
        rawOutput = data?.choices?.[0]?.message?.content || '';
        usedModel = data?.model || freeLlmModel;
        primarySuccess = true;
      } else {
        const errText = await response.text();
        primaryErrorMsg = `FreeLLMAPI returned HTTP ${response.status}: ${errText}`;
        console.warn(`[Heartly AI] FreeLLMAPI responded with error (${response.status}). Triggering OpenRouter fallback...`);
      }
    } catch (fetchErr: any) {
      primaryErrorMsg = fetchErr?.message || String(fetchErr);
      console.warn(`[Heartly AI] FreeLLMAPI connection failed (${primaryErrorMsg}). Triggering OpenRouter fallback...`);
    }

    // Fallback: If FreeLLMAPI was unreachable or threw an error, call OpenRouter
    if (!primarySuccess && openRouterApiKey) {
      try {
        console.log(`[Heartly AI] Querying OpenRouter (${openRouterModel}) fallback...`);
        const orController = new AbortController();
        const orTimeout = setTimeout(() => orController.abort(), 35000);

        const orResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openRouterApiKey}`,
            'HTTP-Referer': 'https://heartly.app',
            'X-Title': 'Heartly Sanctuary',
          },
          body: JSON.stringify({
            model: openRouterModel,
            messages,
            temperature: 0.75,
            max_tokens: 1200,
          }),
          signal: orController.signal,
        });

        clearTimeout(orTimeout);

        if (orResponse.ok) {
          const orData: any = await orResponse.json();
          rawOutput = orData?.choices?.[0]?.message?.content || '';
          usedModel = orData?.model || openRouterModel;
          provider = 'openrouter';
        } else {
          const orErrText = await orResponse.text();
          console.error('[Heartly AI] OpenRouter returned error:', orResponse.status, orErrText);
          res.status(orResponse.status).json({
            error: `OpenRouter fallback returned status ${orResponse.status}`,
            details: orErrText,
            primaryError: primaryErrorMsg,
          });
          return;
        }
      } catch (orErr: any) {
        console.error('[Heartly AI] OpenRouter fallback connection failed:', orErr?.message || orErr);
        res.status(503).json({
          error: 'AI service unreachable',
          message: 'Both FreeLLMAPI and OpenRouter fallback were unreachable. Please check your internet connection.',
          details: orErr?.message || String(orErr),
          primaryError: primaryErrorMsg,
        });
        return;
      }
    } else if (!primarySuccess) {
      res.status(503).json({
        error: 'Unable to connect to AI service',
        message: 'FreeLLMAPI is currently unavailable, and no fallback key is configured.',
        details: primaryErrorMsg,
      });
      return;
    }

    const parsed = parseEmaOutput(rawOutput);

    res.json({
      success: true,
      result: parsed.copyable || parsed.fullText,
      intro: parsed.intro,
      copyable: parsed.copyable,
      fullText: parsed.fullText,
      model: usedModel,
      provider,
    });
  } catch (error: any) {
    console.error('[Heartly AI] General error:', error);
    res.status(500).json({
      error: 'AI assistance generation failed',
      message: error?.message || 'An unexpected error occurred.',
    });
  }
});

export default router;
