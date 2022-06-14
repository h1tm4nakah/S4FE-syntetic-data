import resolve from '@rollup/plugin-node-resolve'; // locate and bundle dependencies in node_modules (mandatory)
import { terser } from "rollup-plugin-terser"; // code minification (optional)
import serve from 'rollup-plugin-serve';
import livereload from 'rollup-plugin-livereload';

export default {
	input: 'src/main.js',
	output: [
		{
			format: 'umd',
			name: 'S4FE-Agents-Simulator',
			file: 'build/bundle.js'
		}
	],
	plugins: [ resolve(), terser(), serve()]
};
