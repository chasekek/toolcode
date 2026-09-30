// llama.cpp provider: talks to a local llama-server through its OpenAI-compatible API.
//
// Start the server with --jinja so the model can call tools:
//   llama-server -m path/to/model.gguf --jinja -c 16384
//
// Optional environment variables:
//   LLAMACPP_URL      server address (default http://127.0.0.1:8080)
//   LLAMACPP_API_KEY  only if you started llama-server with --api-key

const url = (process.env.LLAMACPP_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '');
const apiKey = process.env.LLAMACPP_API_KEY;
const headers = apiKey ? {Authorization: `Bearer ${apiKey}`} : {};

// llama-server serves whichever model it was started with; ask it for the name.
async function loadedModels() {
	try {
		const response = await fetch(`${url}/v1/models`, {headers, signal: AbortSignal.timeout(1500)});
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const {data} = await response.json();
		const models = (data ?? []).map(m => ({id: m.id, label: m.id.split(/[\\/]/).pop()}));
		if (models.length > 0) return models;
	} catch {
		// Server not running yet. It ignores the model name anyway, so offer a placeholder.
	}
	return [{id: 'default', label: 'llama-server (loaded model)'}];
}

export default async () => ({
	name: 'llama.cpp',
	providers: [
		{
			id: 'llamacpp',
			name: 'llama.cpp',
			baseUrl: `${url}/v1`,
			headers,
			models: await loadedModels(),
		},
	],
});
