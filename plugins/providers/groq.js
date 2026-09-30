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
			// Only chat models that can call tools *and* work on the free developer
			// plan, each checked against a real key. Left out on purpose:
			//   llama-3.3-70b-versatile, llama-3.1-8b-instant — Enterprise-gated, 404.
			//   qwen/qwen3.8-27b — free tier caps output at 1000 tokens/minute and a
			//     bare request asks for 2048, so it 429s every time.
			//   whisper-* and canopylabs/* — speech. allam-2-7b — rejects tool calling.
			//   llama-prompt-guard-* and gpt-oss-safeguard-20b — classifiers.
			// To refresh: curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"
			models: [
				{id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B'},
				{id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B'},
			],
		},
	],
};
