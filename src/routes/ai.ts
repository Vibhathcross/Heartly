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

function cleanModelOutput(text: string): string {
  if (!text) return '';
  // Remove any <think>...</think> reasoning blocks if output by deep reasoning models
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function parseEmaOutput(raw: string) {
  const cleaned = cleanModelOutput(raw);

  // Extract tagged sections if model adhered to [CONVERSATION] and [COPYABLE]
  const convMatch = cleaned.match(/\[CONVERSATION\]([\s\S]*?)\[\/CONVERSATION\]/i);
  const copyMatch = cleaned.match(/\[COPYABLE\]([\s\S]*?)\[\/COPYABLE\]/i);

  let intro = convMatch ? convMatch[1].trim() : '';
  let copyable = copyMatch ? copyMatch[1].trim() : '';

  if (copyable) {
    // Both sections identified via tags
    return { intro, copyable, fullText: cleaned };
  }

  // Fallback heuristic: If tags were missing, split opening chatter from the core message
  // Case A: Opening sentence ending in colon (e.g. "Of course! Here is a sweet note for you:\n\n...")
  const colonSplit = cleaned.split(/:\s*\n+/);
  if (colonSplit.length > 1 && colonSplit[0].length < 160 && !colonSplit[0].includes('\n')) {
    intro = colonSplit[0].trim() + ':';
    copyable = colonSplit.slice(1).join('\n\n').trim();
    return { intro, copyable, fullText: cleaned };
  }

  // Case B: Quotes wrapping the main copyable message
  const quoteMatch = cleaned.match(/^([^\n"]+[:!])?\s*["“]([\s\S]+?)["”]\s*$/);
  if (quoteMatch) {
    intro = (quoteMatch[1] || '').trim();
    copyable = quoteMatch[2].trim();
    return { intro, copyable, fullText: cleaned };
  }

  // Default: Entire text is copyable
  return { intro: '', copyable: cleaned, fullText: cleaned };
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

    const systemPrompt = `You are Ema, a deeply polite, loving, sweet, courteous, and attentive AI companion and romantic muse for couples in their Heartly private sanctuary.
You are currently assisting ${senderName}.
Their beloved partner is ${partner}.
Their private couple space is named "${sanctuary}".

Key Personality & Structure Guidelines (MANDATORY):
1. Politeness & Warmth: Always be exceptionally polite, gentle, encouraging, and eager to help ("Of course, ${senderName}!", "I would be delighted to write that for you and ${partner} ♡").
2. Context Awareness: You know both ${senderName} and ${partner} personally, and you cherish their bond in "${sanctuary}".
3. SEPARATION OF CONVERSATION & COPYABLE CONTENT:
Always format your output in two clearly separated blocks:

[CONVERSATION]
Your short, polite, warm conversational words directly to ${senderName}.
[/CONVERSATION]

[COPYABLE]
The exact message, love note, sweet text, poem, apology, or letter ready for ${senderName} to copy and send to ${partner}.
NEVER include conversational introductory filler, greetings to ${senderName}, or meta remarks inside this [COPYABLE] block. It must contain purely the text they wish to copy and send.
[/COPYABLE]

4. If the user asks a purely informational or conversational question (e.g. "What can you do?"), you may place your entire response inside [CONVERSATION].
5. Never output internal reasoning, planning steps, or scratchpad notes.
6. Never be robotic, cold, judgmental, or corporate.`;

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
