import {openAICompatibleStream} from './openaiCompatible.js';
import type {Provider} from './types.js';

const baseUrl = 'https://openrouter.ai/api/v1';

export const openrouter: Provider = {
	id: 'openrouter',
	name: 'OpenRouter',
	apiKeyEnv: 'OPENROUTER_API_KEY',
	baseUrl,
	models: [
		{id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5'},
		{id: 'anthropic/claude-opus-4.1', label: 'Claude Opus 4.1'},
		{id: 'openai/gpt-5', label: 'GPT-5'},
		{id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro'},
		{id: 'deepseek/deepseek-chat-v3.1', label: 'DeepSeek V3.1'},
		{id: 'qwen/qwen3-coder', label: 'Qwen3 Coder'},
	],
	stream: openAICompatibleStream({
		name: 'OpenRouter',
		baseUrl,
		headers: {'X-Title': 'TOOLCODE'},
	}),
};
