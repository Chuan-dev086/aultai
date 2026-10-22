import react from '@vitejs/plugin-react';
export default { plugins: [react()], server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } } };
