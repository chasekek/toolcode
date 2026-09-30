// A provider plugin: GroqCloud speaks the OpenAI chat format, so a baseUrl and a
// key are all it takes.
// Copy to ~/.toolcode/plugins/providers/ to use it.
//
// Get a key at https://console.groq.com/keys, either export GROQ_API_KEY or run
// /auth groq, then pick a model with /model.
export default {
	name: 'groq',
	providers: [
		{
			id: 'groq',
			name: 'Groq',
			baseUrl: 'https://api.groq.com/openai/v1',
			apiKeyEnv: 'GROQ_API_KEY',
			// Chat models only. Groq's catalog also serves speech (whisper-*) and
			// classifiers (llama-prompt-guard, gpt-oss-safeguard), which cannot
			// edit files, so they are left out on purpose.
			models: [
				{id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B'},
				{id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B'},
				{id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B'},
				{id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant'},
				{id: 'qwen/qwen3.8-27b', label: 'Qwen3.8 27B (preview)'},
			],
		},
	],
};
