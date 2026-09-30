// A provider plugin: any OpenAI-compatible API needs only a baseUrl and models.
// Copy to ~/.toolcode/plugins/providers/, start Ollama, then pick a model with /model.
export default {
	name: 'ollama',
	providers: [
		{
			id: 'ollama',
			name: 'Ollama (local)',
			baseUrl: 'http://localhost:11434/v1',
			// No apiKeyEnv: local servers need no key.
			models: ['qwen2.5-coder:14b', 'llama3.1:8b'],
		},
	],
};
