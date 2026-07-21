// Importa o plugin do Tailwind CSS integrado com o Vite para estilização
import tailwindcss from '@tailwindcss/vite';
// Importa o plugin do React para o Vite permitir compilar componentes e JSX
import react from '@vitejs/plugin-react';
// Importa o módulo nativo 'path' para resolver caminhos de diretórios no projeto
import path from 'path';
// Importa funções do Vite para definir a configuração e carregar variáveis de ambiente
import {defineConfig, loadEnv} from 'vite';

// Função assíncrona/dinâmica que exporta a configuração do Vite com base no modo de execução (desenvolvimento ou produção)
export default defineConfig(({mode}) => {
  // Carrega as variáveis de ambiente do diretório atual com base no modo ativo
  const env = loadEnv(mode, '.', '');
  return {
    // Configura os plugins ativos no projeto: suporte ao React e ao Tailwind CSS
    plugins: [react(), tailwindcss()],
    define: {
      // Injeta a chave de API do Gemini nas variáveis globais do código no lado do cliente
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      // Configura atalhos de caminhos (aliases), permitindo usar '@' para referenciar a raiz do projeto
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
