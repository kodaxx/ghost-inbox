import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// Use Node.js adapter for standalone deployment
		adapter: adapter({
			out: 'build'
		})
	}
};

export default config;
