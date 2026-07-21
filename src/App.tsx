// Importa o gancho useState para gerenciar estados locais, useEffect para efeitos colaterais e useRef para referências mutáveis que persistem entre renderizações
import React, { useState, useEffect, useRef } from 'react';
// Importa ícones da biblioteca Lucide React para renderizar elementos visuais na interface
import { Play, CheckCircle, Hand, FastForward, Trophy, AlertTriangle, Maximize, Minimize, Home } from 'lucide-react';

// ==========================================
// TIPAGENS DO SISTEMA
// ==========================================
type GameState =
  | 'WAITING_TO_START' // Estado 1: Tela de Início
  | 'QUESTION_LOCKED'  // Estado 2: Pergunta na tela, botões bloqueados
  | 'QUESTION_ACTIVE'  // Estado 3: Tempo rodando, aguardando clique (disputa)
  | 'PLAYER_ANSWERING' // Estado 4: Equipe foi a mais rápida, aguardando resposta verbal
  | 'RESULT_DISPLAY'   // Estado 5: Resposta validada, mostra o erro/acerto
  | 'TIMEOUT_DISPLAY'  // Sub-Estado 5: Ninguém respondeu a tempo
  | 'GAME_OVER';       // Estado 6: Tela final de vencedor

type PlayerType = 'P1' | 'P2';

interface Pergunta {
  id: number;
  pergunta: string;
  a: string;
  b: string;
  c: string;
  d: string;
  correta: 'A' | 'B' | 'C' | 'D';
}

interface LogEntry {
  timestamp: string;
  partida_id: string;
  rodada: number;
  evento: string;
  detalhe: string;
}

// ==========================================
// FUNÇÃO ISOLADA: DEBOUNCE DO HARDWARE
// ==========================================
// Esta regra garante que sinais "ruidosos" ou cliques duplos do hardware hackeado não passem pelo sistema
const DBOUNCE_DELAY_MS = 2000;
let lastHardwareInputRef = 0; // Utilizado globalmente/fora do state para zero atraso

const validateHardwareDebounce = (): boolean => {
  const now = Date.now();
  if (now - lastHardwareInputRef < DBOUNCE_DELAY_MS) {
    return false; // Rejeita a entrada elétrica
  }
  lastHardwareInputRef = now;
  return true; // Aceita a entrada elétrica
};


// ==========================================
// COMPONENTE PRINCIPAL (VIEW & CONTROLLER)
// ==========================================
export default function App() {
  // Não há mais estados de autenticação

  // --- Fullscreen State ---
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Efeito colateral para monitorar alterações no modo de tela cheia do navegador
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        alert("Não foi possível entrar em modo tela cheia. Se estiver no preview da plataforma, clique no botão superior direito do applet para abrir em uma nova aba primeiro.");
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // --- Máquina de Estados ---
  const [gameState, setGameState] = useState<GameState>('WAITING_TO_START');
  
  const [showRules, setShowRules] = useState(false);

  // --- Estados do Jogo (Memória Contextual) ---
  const [questions, setQuestions] = useState<Pergunta[]>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [matchId, setMatchId] = useState('');
  
  const [score, setScore] = useState({ p1: 0, p2: 0 });
  const [timer, setTimer] = useState(15);
  const [fastestPlayer, setFastestPlayer] = useState<PlayerType | null>(null);
  const [selectedAlternative, setSelectedAlternative] = useState<'A'|'B'|'C'|'D' | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = (evento: string, detalhe: string, specificMatchId = matchId, specificRound = currentQuestionIdx + 1) => {
    const newLog = {
      timestamp: new Date().toISOString(),
      partida_id: specificMatchId,
      rodada: specificRound,
      evento,
      detalhe
    };
    setLogs(prev => [...prev, newLog]);

    fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newLog)
    }).catch(console.error);
  };

  // Referência do Estado atual para acessar dentro do event listener global do `addEventListener`
  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // --- Audio Synthesizer (Web Audio API) ---
  const audioCtxRef = useRef<AudioContext | null>(null);

  const initAudio = () => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  const playSound = (type: 'buzz' | 'correct' | 'wrong' | 'timeout' | 'tick', value?: number) => {
    console.log(`🔊 [ÁUDIO] Som acionado: ${type}`);
    if (!audioCtxRef.current) return;
    
    try {
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      if (type === 'buzz') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
      } else if (type === 'correct') {
        const audio = new Audio('/applause.mp3');
        audio.play().catch(e => console.error("Erro ao tocar applause.mp3:", e));
      } else if (type === 'wrong') {
        const audio = new Audio('/boo.mp3');
        audio.play().catch(e => console.error("Erro ao tocar boo.mp3:", e));
      } else if (type === 'timeout') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.6);
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.6);
      } else if (type === 'tick') {
        const timeRemaining = value ?? 15;
        const urgency = Math.max(0, 15 - timeRemaining) / 15; // 0 até 1
        
        osc.type = 'triangle';
        const freq = 400 + (urgency * 600); // Frequência aumenta com a urgência
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.8, ctx.currentTime + 0.1);
        
        const vol = 0.05 + (urgency * 0.05); // Volume aumenta ligeiramente
        gainNode.gain.setValueAtTime(vol, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.1);
        
        // Efeito de clique duplo se o tempo for <= 5 segundos
        if (timeRemaining <= 5) {
          const osc2 = ctx.createOscillator();
          const gainNode2 = ctx.createGain();
          osc2.connect(gainNode2);
          gainNode2.connect(ctx.destination);
          
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(freq * 1.2, ctx.currentTime + 0.15);
          osc2.frequency.exponentialRampToValueAtTime(freq * 0.8, ctx.currentTime + 0.25);
          
          gainNode2.gain.setValueAtTime(vol, ctx.currentTime + 0.15);
          gainNode2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
          
          osc2.start(ctx.currentTime + 0.15);
          osc2.stop(ctx.currentTime + 0.25);
        }
      }
    } catch (e) {
      console.error("Erro ao tocar som:", e);
    }
  };

  // --- Efeito: Relógio Regressivo ---
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    
    // O timer só roda quando a MAQUINA DE ESTADO está no Estado 3 (QUESTION_ACTIVE)
    if (gameState === 'QUESTION_ACTIVE' && timer > 0) {
      playSound('tick', timer);
      intervalId = setInterval(() => {
        setTimer((prev) => {
          if (prev <= 1) {
            clearInterval(intervalId);
            handleTimeRunOut(); // Fim do tempo!
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, timer]);

  // --- Função: Fim do Tempo (Time Out) ---
  const handleTimeRunOut = () => {
    playSound('timeout');
    
    // MÁQUINA DE ESTADO: Avança do Estado 3 para o Timeout Display (Sub-Estado 5)
    setGameState('TIMEOUT_DISPLAY');
    addLog('TEMPO_ESGOTADO', 'Nenhuma equipe respondeu em 15 segundos.');
  };

  // --- Efeito: Interceptador de Teclado Físico ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // REGRA: Os botões só funcionam se a MAQUINA DE ESTADO estiver no Estado 3
      if (gameStateRef.current !== 'QUESTION_ACTIVE') return;

      const key = e.key.toLowerCase();
      // O 'hack do teclado' mapeia os golpes de botão nas teclas 'A' e 'L'
      if (key === 'a' || key === 'l') {
        
        // Aplica o validador rigoroso de Hardware Debounce isolado
        if (!validateHardwareDebounce()) {
          console.warn("[HARDWARE] Debounce Rejeitou: clique duplo detectado.");
          return; 
        }

        const playerDetected: PlayerType = key === 'a' ? 'P1' : 'P2';
        handleBuzz(playerDetected);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Função: Disparo do Botão (Buzz) ---
  const handleBuzz = (player: PlayerType) => {
    playSound('buzz');
    setFastestPlayer(player);
    
    // MÁQUINA DE ESTADO: Avança do Estado 3 para o Estado 4 (Aguardando Resposta Verbal)
    setGameState('PLAYER_ANSWERING');
    addLog('BOTAO_PRESSIONADO', `A ${player === 'P1' ? 'Equipe 1' : 'Equipe 2'} apertou primeiro!`);
  };

  // --- Controller Apresentador: Iniciar Partida ---
  const handleStartMatch = async () => {
    initAudio(); // Desbloqueia o áudio no primeiro clique do usuário
    setIsLoading(true);
    
    try {
      const res = await fetch('/api/perguntas');
      if (!res.ok) throw new Error("Falha ao carregar perguntas");
      const fetchedQs = await res.json();
      
      if (fetchedQs.length === 0) {
        alert("Nenhuma pergunta carregada/encontrada!");
        setIsLoading(false);
        return;
      }
      
      // Embaralhar as questões (Fisher-Yates Shuffle)
      for (let i = fetchedQs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [fetchedQs[i], fetchedQs[j]] = [fetchedQs[j], fetchedQs[i]];
      }
      
      // Limitar a, no máximo, 10 perguntas por partida
      const matchQuestions = fetchedQs.slice(0, 10);
      
      setQuestions(matchQuestions);
      
      const newMatchId = 'MATCH-ID-' + Math.floor(Math.random() * 1000000);
      setMatchId(newMatchId);
      setCurrentQuestionIdx(0);
      setScore({ p1: 0, p2: 0 });
      
      // MÁQUINA DE ESTADO: Avança do Estado 1 (Espera) para o Estado 2 (Bloqueado)
      setGameState('QUESTION_LOCKED');
      
      addLog('INICIO_PARTIDA', 'Partida iniciada com perguntas locais.', newMatchId, 1);
    } catch (e: any) {
      alert("Erro ao buscar perguntas: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Controller Apresentador: Confirmar Resposta Escolhida Verbalmente ---
  const handleConfirmAnswer = () => {
    if (!selectedAlternative || !fastestPlayer) return;
    
    // MÁQUINA DE ESTADO: Avança do Estado 4 para o Estado 5 (Resultados)
    setGameState('RESULT_DISPLAY');

    const currentQ = questions[currentQuestionIdx];
    const isCorrect = selectedAlternative === currentQ.correta;

    let p1Delta = 0;
    let p2Delta = 0;

    // Regras de Negócio e Pontuação
    if (isCorrect) {
      playSound('correct');
      if (fastestPlayer === 'P1') p1Delta = 1; else p2Delta = 1;
    } else {
      playSound('wrong');
      if (fastestPlayer === 'P1') { p1Delta = -1; p2Delta = 1; } 
      else { p2Delta = -1; p1Delta = 1; }
    }

    setScore(prev => ({
      p1: prev.p1 + p1Delta,
      p2: prev.p2 + p2Delta
    }));
    
    addLog('RESPOSTA_AVALIADA', `J1: ${p1Delta} / J2: ${p2Delta} | Gabarito: ${currentQ.correta} | Escolhida: ${selectedAlternative}`);
// --- Controller Apresentador: Avançar Roteiro ---
  const handleAdvanceSequence = () => {
    const isLastAvailableRound = currentQuestionIdx >= questions.length - 1;

    if (isLastAvailableRound) {
      // Direct game over if no more questions
      setGameState('GAME_OVER');
    } else {
      // Advance to next available round
      setCurrentQuestionIdx(prev => prev + 1);
      resetForNextQuestion();
    }
  };

  const resetForNextQuestion = () => {
    // MÁQUINA DE ESTADO: Retorna o sistema ao Estado 2 para a nova rodada
    setGameState('QUESTION_LOCKED');
    setTimer(15);
    setFastestPlayer(null);
    setSelectedAlternative(null);
  };


  // ==========================================
  // RENDERIZAÇÃO DA INTERFACE GRÁFICA
  // ==========================================
  
  // Render do componente de Perguntas - visível nos estados 2, 3, 4, 5
  const renderQuestionBoard = () => {
    if (!questions || questions.length === 0) return null;
    const currentQ = questions[currentQuestionIdx];

    return (
      <div className="flex flex-col items-center w-full max-w-6xl z-10 px-8 pt-8 pb-32 mt-12 mx-auto">
        {/* Cabeçalho do Score e Rodada */}
        <div className="flex w-full justify-between items-center mb-8">
          <div className="bg-white border-4 border-cyan-400 rounded-3xl p-6 shadow-xl w-64 text-center">
            <span className="text-cyan-600 font-black tracking-widest text-lg block mb-1">EQUIPE 1</span>
            <span className="text-cyan-900 text-7xl font-black">{score.p1}</span>
          </div>
          
          <div className="flex flex-col items-center justify-center">
            <span className="bg-slate-200 text-slate-700 px-6 py-2 rounded-full font-bold tracking-widest mb-4 border border-slate-300">
               {currentQuestionIdx === questions.length - 1 ? '🔥 ÚLTIMA RODADA 🔥' : `PERGUNTA ${currentQuestionIdx + 1} DE ${questions.length}`}
            </span>
            {/* Relógio só destaca nos estados interativos */}
            {['QUESTION_ACTIVE', 'PLAYER_ANSWERING'].includes(gameState) && (
               <div className={`text-8xl font-black transition-colors ${timer <= 5 ? 'text-red-600 animate-[pulse_0.5s_ease-in-out_infinite]' : 'text-slate-800'}`}>
                 00:{timer.toString().padStart(2, '0')}
               </div>
            )}
            {gameState === 'QUESTION_LOCKED' && <div className="text-6xl font-black text-slate-300">00:15</div>}
          </div>

          <div className="bg-white border-4 border-orange-400 rounded-3xl p-6 shadow-xl w-64 text-center">
            <span className="text-orange-600 font-black tracking-widest text-lg block mb-1">EQUIPE 2</span>
            <span className="text-orange-900 text-7xl font-black">{score.p2}</span>
          </div>
        </div>

        {/* Quadro da Pergunta */}
        <div className="w-full bg-white rounded-3xl p-10 shadow-xl border-2 border-slate-200 mb-8 z-10">
          <h2 className="text-5xl font-black leading-tight text-slate-900">{currentQ.pergunta}</h2>
        </div>

        {/* Grid de Alternativas */}
        <div className={`grid grid-cols-2 gap-8 w-full transition-opacity duration-500 ${gameState === 'PLAYER_ANSWERING' && !selectedAlternative ? 'opacity-40' : 'opacity-100'}`}>
          {(['A', 'B', 'C', 'D'] as const).map(letter => {
            const isSelected = selectedAlternative === letter;
            const isCorrect = currentQ.correta === letter;
            const keyLower = letter.toLowerCase() as keyof Pergunta;
            const text = currentQ[keyLower] as string;

            // Lógica de design dinâmica baseada no Estado:
            let bgClass = "bg-white hover:bg-slate-50";
            let fontColorClass = "text-slate-800";
            let borderClass = "border-slate-300";

            if (gameState === 'PLAYER_ANSWERING' && isSelected) {
              bgClass = "bg-yellow-100";
              fontColorClass = "text-slate-900";
              borderClass = "border-yellow-400 ring-8 ring-yellow-200/50";
            } else if (gameState === 'RESULT_DISPLAY') {
              if (isCorrect) {
                bgClass = "bg-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.3)]";
                fontColorClass = "text-white";
                borderClass = "border-emerald-600";
                if (!isSelected) bgClass += " animate-pulse"; // Ajuda a destacar a correta se errou
              } else if (isSelected && !isCorrect) {
                bgClass = "bg-red-500";
                fontColorClass = "text-white";
                borderClass = "border-red-600";
              } else {
                bgClass = "bg-slate-100 opacity-40";
                borderClass = "border-slate-200";
              }
            } else if (gameState === 'TIMEOUT_DISPLAY') {
               // Perdeu, apenas mostra a correta em verde escuro desanimado
               if (isCorrect) bgClass = "bg-emerald-100 text-emerald-900 border-emerald-400";
               else bgClass = "bg-slate-100 opacity-40 border-slate-200";
            }

            return (
              <div 
                key={letter}
                onClick={() => {
                  // Ação exclusiva do apresentador no estado de fala do participante
                  if (gameState === 'PLAYER_ANSWERING') setSelectedAlternative(letter)
                }}
                className={`relative flex items-center border-4 rounded-3xl p-8 transition-all duration-300 ${gameState === 'PLAYER_ANSWERING' ? 'cursor-pointer hover:scale-105' : 'cursor-default'} ${bgClass} ${borderClass}`}
              >
                <div className={`text-4xl font-black mr-6 ${gameState === 'RESULT_DISPLAY' || gameState === 'PLAYER_ANSWERING' ? '' : 'text-slate-500'}`}>
                  {letter}
                </div>
                <div className={`text-3xl font-bold ${fontColorClass}`}>
                  {text}
                </div>
              </div>
            );
          })}
        </div>

        {/* ALERTA GIGANTE DE FASTEST PLAYER Overlay */}
        {gameState === 'PLAYER_ANSWERING' && fastestPlayer && (
          <div className={`fixed inset-x-0 mx-auto top-36 w-fit py-6 px-16 rounded-full text-5xl font-black shadow-2xl animate-bounce border-8 z-50 ${
            fastestPlayer === 'P1' 
              ? 'bg-cyan-600 border-cyan-300 text-white shadow-[0_0_80px_rgba(8,145,178,0.8)]' 
              : 'bg-orange-600 border-orange-300 text-white shadow-[0_0_80px_rgba(234,88,12,0.8)]'
          }`}>
             {fastestPlayer === 'P1' ? '⚡ EQUIPE 1 APERTOU!' : '⚡ EQUIPE 2 APERTOU!'}
          </div>
        )}

      </div>
    );
  };


  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-slate-200 overflow-hidden relative font-black">
      
      {/* Botão Tela Cheia */}
      <button 
        onClick={toggleFullscreen}
        className="fixed top-4 right-4 z-[9999] p-4 bg-slate-900 border-2 border-slate-700 hover:border-slate-500 rounded-full text-slate-300 hover:text-white transition-all hover:scale-110 shadow-xl"
        title="Alternar Tela Cheia"
      >
        {isFullscreen ? <Minimize size={28} /> : <Maximize size={28} />}
      </button>

      {/* Overlay Modal: Desistir da Partida */}
      {showQuitConfirm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white p-10 rounded-3xl shadow-2xl max-w-lg text-center flex flex-col items-center">
            <AlertTriangle size={64} className="text-red-500 mb-6" />
            <h2 className="text-3xl font-black text-slate-800 mb-4">Desistir da Partida?</h2>
            <p className="text-slate-600 font-medium mb-10 text-lg">
              Tem certeza que deseja encerrar a partida atual e retornar à tela inicial? O progresso será perdido.
            </p>
            <div className="flex gap-4 w-full">
              <button 
                onClick={() => setShowQuitConfirm(false)}
                className="flex-1 py-4 text-slate-600 font-bold bg-slate-100 rounded-full hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  setShowQuitConfirm(false);
                  setGameState('WAITING_TO_START');
                  setScore({ p1: 0, p2: 0 });
                  setSelectedAlternative(null);
                  setFastestPlayer(null);
                }}
                className="flex-1 py-4 text-white font-bold bg-red-600 rounded-full hover:bg-red-700 transition-colors"
              >
                Sim, Desistir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Botão Desistir / Sair da Partida */}
      {gameState !== 'WAITING_TO_START' && (
        <button 
          onClick={() => setShowQuitConfirm(true)}
          className="fixed top-6 left-6 z-[9999] p-4 bg-white border-2 border-slate-200 text-slate-600 rounded-full hover:bg-slate-100 hover:text-red-600 hover:border-red-200 transition-colors shadow-lg flex items-center justify-center"
          title="Voltar ao Início"
        >
          <Home size={24} />
        </button>
      )}

      {/* MÁQUINA DE ESTADOS - REGRAS DE RENDERIZAÇÃO */}
      {gameState === 'WAITING_TO_START' && (
        <div className="flex flex-col items-center justify-center min-h-[90vh] bg-white">
          <img src="/logo.png" alt="Conectando Ciências, Tecnologias e Artes" className="w-[800px] h-auto object-contain mb-8" />
          {/* Removed subtitle as requested */}
          
          <div className="flex flex-col items-center gap-6">
            <button 
              onClick={handleStartMatch}
              disabled={isLoading}
              className="group relative inline-flex items-center justify-center px-16 py-6 text-2xl font-black text-white transition-all duration-200 bg-slate-900 border-b-8 border-slate-950 rounded-full hover:bg-slate-800 focus:outline-none active:border-b-0 active:translate-y-1 disabled:opacity-50"
            >
              {isLoading ? 'CARREGANDO PERGUNTAS...' : 'INICIAR PARTIDA'}
              {!isLoading && <Play className="ml-4" size={32} />}
            </button>
            <button 
              onClick={() => setShowRules(true)}
              className="text-slate-500 hover:text-slate-800 font-bold uppercase tracking-widest text-lg transition-colors"
            >
              Ver Regras do Jogo
            </button>
          </div>

          {/* Modal de Regras */}
          {showRules && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white p-10 rounded-3xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-4xl font-black text-slate-800 uppercase tracking-widest">Regras da Arena</h2>
                  <button onClick={() => setShowRules(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                    <AlertTriangle size={32} className="opacity-0" /> {/* Placeholder para alinhar */}
                  </button>
                </div>
                
                <div className="space-y-6 text-xl text-slate-700 font-medium pb-8 border-b-2 border-slate-100">
                  <p><span className="font-black text-slate-900">1. O Duelo:</span> Duas equipes competem na arena. Uma pergunta será exibida no telão a cada rodada.</p>
                  <p><span className="font-black text-slate-900">2. A Disputa:</span> Quando o apresentador liberar a pergunta, vocês têm <strong className="text-red-600">15 segundos</strong> para bater no botão.</p>
                  <p><span className="font-black text-slate-900">3. A Resposta:</span> Quem apertar primeiro deverá responder verbalmente. O apresentador confirmará no sistema.</p>
                  <p><span className="font-black text-slate-900">4. Pontuação e Punição:</span>
                    <ul className="list-disc pl-8 mt-2 space-y-2">
                       <li>Acertou? <strong className="text-emerald-600">+1 Ponto</strong> para você.</li>
                       <li>Errou? <strong className="text-red-600">-1 Ponto</strong> para você, e seu oponente ganha <strong className="text-emerald-600">+1 Ponto</strong>!</li>
                    </ul>
                  </p>
                  <p><span className="font-black text-slate-900">5. Fim do Tempo:</span> Se ninguém bater no botão em 15 segundos, a rodada é anulada.</p>
                </div>

                <div className="mt-8 flex justify-center">
                  <button 
                    onClick={() => setShowRules(false)}
                    className="px-12 py-4 text-white font-black bg-slate-900 rounded-full hover:bg-slate-800 transition-colors text-xl tracking-widest uppercase border-b-4 border-slate-950 active:translate-y-1 active:border-b-0"
                  >
                    Entendido, fechar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* RENDERIZAÇÃO UNIFICADA DE TODOS OS ESTADOS DE JOGO NAS RODADAS */}
      {['QUESTION_LOCKED', 'QUESTION_ACTIVE', 'PLAYER_ANSWERING', 'RESULT_DISPLAY', 'TIMEOUT_DISPLAY'].includes(gameState) && renderQuestionBoard()}

      {/* GAME_OVER STATE */}
      {gameState === 'GAME_OVER' && (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white via-slate-50 to-slate-200">
          <h1 className="text-8xl font-black text-slate-900 mt-12 mb-16">FIM DO COMBATE</h1>
          
          {score.p1 === score.p2 ? (
            <div className="text-8xl font-black py-12 px-24 rounded-3xl border-8 bg-slate-100 border-slate-300 text-slate-700 shadow-xl mb-12">
               EMPATE ABSOLUTO!
            </div>
          ) : (
            <div className={`flex flex-col items-center text-7xl text-center font-black py-16 px-32 rounded-[3rem] border-8 shadow-2xl mb-12 transform scale-110 ${score.p1 > score.p2 ? 'bg-cyan-50 border-cyan-400 text-cyan-700 shadow-[0_0_120px_rgba(8,145,178,0.2)]' : 'bg-orange-50 border-orange-400 text-orange-700 shadow-[0_0_120px_rgba(234,88,12,0.2)]'}`}>
              <span className="text-4xl text-slate-500 mb-4 tracking-widest uppercase shadow-none">Vencedor Oficial</span>
              {score.p1 > score.p2 ? '⚡ EQUIPE 1' : '🔥 EQUIPE 2'}
            </div>
          )}

          <div className="flex gap-16 text-5xl font-black mt-8">
             <span className="bg-white py-6 px-12 rounded-3xl border-4 border-cyan-200 text-cyan-600 shadow-xl">E1 = {score.p1} pts</span>
             <span className="bg-white py-6 px-12 rounded-3xl border-4 border-orange-200 text-orange-600 shadow-xl">E2 = {score.p2} pts</span>
          </div>

          <a 
            href="/api/logs/download" 
            className="mt-16 bg-slate-800 text-white px-8 py-4 rounded-full font-bold uppercase tracking-widest hover:bg-slate-700 transition"
          >
            Baixar Histórico de Logs (CSV)
          </a>
        </div>
      )}

      {/* ========================================== */}
      {/* BARRA DE SUPERVISÃO: CONTROLES DO APRESENTADOR */}
      {/* ========================================== */}
      {gameState !== 'WAITING_TO_START' && (
        <div className={`fixed bottom-0 inset-x-0 h-28 bg-white border-t-2 border-slate-200 flex items-center justify-center p-4 gap-8 shadow-[0_-20px_50px_-15px_rgba(0,0,0,0.1)] transition-all duration-300 z-50 ${gameState === 'PLAYER_ANSWERING' && !selectedAlternative ? 'bg-yellow-50/50 border-yellow-200' : ''}`}>
          
          <div className="absolute left-8 top-1/2 -translate-y-1/2 flex flex-col">
             <span className="text-slate-400 font-bold uppercase tracking-widest text-xs">Acesso Restrito</span>
             <span className="text-slate-600 font-black tracking-widest text-lg">MESA DO APRESENTADOR</span>
          </div>
          
          {gameState === 'QUESTION_LOCKED' && (
            <button onClick={() => {
              setGameState('QUESTION_ACTIVE');
              playSound('buzz');
            }} className="group relative inline-flex items-center justify-center px-12 py-4 text-xl font-black text-white bg-emerald-600 border-b-8 border-emerald-800 rounded-full hover:bg-emerald-500 active:border-b-0 active:translate-y-2">
              <Hand className="mr-3" size={28}/> LIBERAR BOTÕES DA ARENA
            </button>
          )}

          {gameState === 'QUESTION_ACTIVE' && (
            <div className="flex items-center bg-slate-50 border-2 border-slate-200 text-slate-700 px-12 py-4 rounded-full">
              <span className="text-xl font-black tracking-widest flex items-center gap-3">
                 <span className="relative flex h-5 w-5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-5 w-5 bg-emerald-500"></span>
                 </span>
                 BOTÕES ATIVOS. AGUARDANDO DISPUTA...
              </span>
            </div>
          )}

          {gameState === 'PLAYER_ANSWERING' && selectedAlternative && (
            <button onClick={handleConfirmAnswer} className="group relative inline-flex items-center justify-center px-12 py-4 text-xl font-black text-white bg-blue-600 border-b-8 border-blue-800 rounded-full hover:bg-blue-500 active:border-b-0 active:translate-y-2 ring-4 ring-blue-200 animate-pulse">
              <CheckCircle className="mr-3" size={28}/> VALIDAR RESPOSTA "{selectedAlternative}"
            </button>
          )}

          {gameState === 'PLAYER_ANSWERING' && !selectedAlternative && (
            <span className="text-xl font-black text-yellow-700 bg-yellow-50 border-2 border-yellow-200 py-4 px-12 rounded-full uppercase tracking-widest flex items-center">
              <AlertTriangle className="mr-3"/> OUÇA A EQUIPE E CLIQUE NA ALTERNATIVA DITA
            </span>
          )}

          {(gameState === 'RESULT_DISPLAY' || gameState === 'TIMEOUT_DISPLAY') && (
            <button onClick={handleAdvanceSequence} className="group relative inline-flex items-center justify-center px-12 py-4 text-xl font-black text-slate-900 bg-yellow-400 border-b-8 border-yellow-500 rounded-full hover:bg-yellow-300 active:border-b-0 active:translate-y-2 text-shadow-sm">
              {currentQuestionIdx >= questions.length - 1 ? 'ENCERRAR E VER RESULTADOS' : 'PULAR PARA PRÓXIMA PERGUNTA'} <FastForward className="ml-3" size={28} />
            </button>
          )}

          {gameState === 'GAME_OVER' && (
             <button onClick={() => { setGameState('WAITING_TO_START'); setScore({ p1: 0, p2: 0 }); }} className="group relative inline-flex items-center justify-center px-12 py-4 text-xl font-black text-slate-800 bg-slate-200 border-b-8 border-slate-300 rounded-full hover:bg-slate-300 active:border-b-0 active:translate-y-2">
                NOVA PARTIDA
             </button>
          )}
          
        </div>
      )}

    </div>
  );
}
 
