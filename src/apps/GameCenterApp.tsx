import React, { useMemo, useState } from 'react';
import { Trophy, Sparkles, Brain, Type, BookHeart, RotateCcw, ArrowLeft } from 'lucide-react';
import { useOS } from '../context/OSContext';
import { osApi } from '../services/api';

type GameMode = 'hub' | 'trivia' | 'word' | 'memory' | 'vn';

const TRIVIA_Q = [
  { q: 'Khu phố nào ở Tokyo nổi tiếng với văn hóa anime và đồ điện tử?', opts: ['Akihabara', 'Asakusa', 'Roppongi', 'Ginza'], ans: 0 },
  { q: 'Trong PHONE OS, nhân vật nào thích nhạc lo-fi đêm khuya & matcha?', opts: ['Akira', 'Yuki', 'Rin', 'Sakura'], ans: 1 },
  { q: 'Máy chủ Express của PHONE OS chạy trên cổng (port) nào?', opts: ['8080', '5173', '3000', '4200'], ans: 2 },
  { q: 'Món bánh ngọt Nhật Bản nào được Sakura nhắc tới?', opts: ['Bánh dưa lưới Melonpan', 'Daifuku dâu tây', 'Takoyaki', 'Cơm nắm Onigiri'], ans: 1 },
];

const WORD_LIST = ['SAKURA', 'SHIBUYA', 'MEMORY', 'AURORA', 'KYOTO'];

const GAME_LABELS: Record<string, string> = {
  trivia_quiz: 'Đố vui Anime & OS',
  word_guess: 'Đoán từ khóa',
  memory_match: 'Lật thẻ Nhân vật',
  visual_novel: 'Visual Novel',
};

const VN_NODES: Record<string, { speaker: string; text: string; choices?: { label: string; next: string; pts: number }[] }> = {
  start: {
    speaker: 'Yuki Shirakawa',
    text: 'Ngoài trời quán cà phê Shibuya vừa tạnh mưa rồi. Tụi mình đi đâu tiếp theo nhé?',
    choices: [
      { label: 'Lên đài quan sát sân thượng ngắm phố đêm', next: 'rooftop', pts: 50 },
      { label: 'Ghé tiệm đĩa than cổ ở Shimokitazawa', next: 'vinyl', pts: 60 },
    ],
  },
  rooftop: {
    speaker: 'Yuki Shirakawa',
    text: 'Nhìn ánh đèn neon phản chiếu trên mặt đường ướt mưa kìa! Đứng yên chút nhé—để mình lưu khoảnh khắc này cùng bạn.',
    choices: [{ label: 'Cùng uống matcha latte và ngắm sao (+100 điểm)', next: 'end_happy', pts: 100 }],
  },
  vinyl: {
    speaker: 'Yuki Shirakawa',
    text: 'Mình tìm được bản đĩa than lo-fi ambient phát hành năm 1998 nè! Mang về studio cùng nghe nhé.',
    choices: [{ label: 'Đặt đĩa lên máy phát nhạc (+100 điểm)', next: 'end_happy', pts: 100 }],
  },
  end_happy: {
    speaker: 'Hoàn thành câu chuyện',
    text: 'Một kỷ niệm buổi tối thật ấm áp đã được lưu lại trong nhật ký PHONE OS của bạn.',
  },
};

export function GameCenterApp() {
  const { data, refreshData, showToast } = useOS();
  const [mode, setMode] = useState<GameMode>('hub');

  // Trivia state
  const [qIdx, setQIdx] = useState(0);
  const [triviaScore, setTriviaScore] = useState(0);
  const [triviaDone, setTriviaDone] = useState(false);

  // Word guess state
  const [targetWord, setTargetWord] = useState(() => WORD_LIST[0]);
  const [guessed, setGuessed] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);

  // Memory match state
  const cardsSeed = useMemo(() => {
    const chars = (data?.characters || []).slice(0, 4);
    const base = chars.map((c) => ({ key: c.id, name: c.name, avatar: c.avatar }));
    return [...base, ...base].map((c, idx) => ({ ...c, uid: idx }));
  }, [data?.characters]);
  const [shuffled, setShuffled] = useState<typeof cardsSeed>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);

  // Visual Novel state
  const [vnNode, setVnNode] = useState('start');
  const [vnScore, setVnScore] = useState(0);

  const saveScore = async (game_id: string, score: number, detail: string) => {
    await osApi.addGameScore({ game_id, score, detail });
    await refreshData();
    showToast('Đã lưu điểm', `${GAME_LABELS[game_id] || game_id}: ${score} điểm`, 'success');
  };

  const startMemory = () => {
    const deck = [...cardsSeed].sort(() => Math.random() - 0.5);
    setShuffled(deck);
    setFlipped([]);
    setMatched([]);
    setMoves(0);
    setMode('memory');
  };

  const handleFlipCard = (uid: number) => {
    if (flipped.length === 2 || flipped.includes(uid)) return;
    const card = shuffled.find((c) => c.uid === uid);
    if (!card || matched.includes(card.key)) return;
    const nextFlipped = [...flipped, uid];
    setFlipped(nextFlipped);
    if (nextFlipped.length === 2) {
      setMoves((m) => m + 1);
      const first = shuffled.find((c) => c.uid === nextFlipped[0]);
      if (first && first.key === card.key) {
        const nextMatched = [...matched, card.key];
        setMatched(nextMatched);
        setFlipped([]);
        if (nextMatched.length === 4) {
          const pts = Math.max(50, 300 - (moves + 1) * 15);
          saveScore('memory_match', pts, `Hoàn thành sau ${moves + 1} lượt`);
        }
      } else {
        setTimeout(() => setFlipped([]), 650);
      }
    }
  };

  const wordWon = targetWord.split('').every((ch) => guessed.includes(ch));
  const wordLost = mistakes >= 6;

  return (
    <div className="h-full flex flex-col bg-[#F7F7FA] dark:bg-[#101014] text-zinc-900 dark:text-zinc-100">
      <div className="px-4 py-3 bg-white dark:bg-[#1A1A22] border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        {mode !== 'hub' ? (
          <button onClick={() => setMode('hub')} className="flex items-center gap-1 text-xs font-semibold">
            <ArrowLeft className="w-4 h-4" /> Trung tâm Trò chơi
          </button>
        ) : (
          <div>
            <h1 className="text-base font-bold font-display">Trò chơi</h1>
            <p className="text-[11px] text-zinc-500">4 Mini-Game & Bảng xếp hạng nội bộ</p>
          </div>
        )}
        <Trophy className="w-5 h-5 text-amber-500" />
      </div>

      <div className="flex-1 overflow-y-auto os-scroll p-4 space-y-4">
        {mode === 'hub' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setQIdx(0);
                  setTriviaScore(0);
                  setTriviaDone(false);
                  setMode('trivia');
                }}
                className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 text-left space-y-2"
              >
                <Brain className="w-5 h-5 text-[#A78BFA]" />
                <p className="text-xs font-bold">Đố vui Anime & OS</p>
                <p className="text-[10px] text-zinc-500">Thử thách nhanh 4 câu hỏi</p>
              </button>

              <button
                onClick={() => {
                  const w = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
                  setTargetWord(w);
                  setGuessed([]);
                  setMistakes(0);
                  setMode('word');
                }}
                className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 text-left space-y-2"
              >
                <Type className="w-5 h-5 text-pink-500" />
                <p className="text-xs font-bold">Đoán từ khóa</p>
                <p className="text-[10px] text-zinc-500">Giải mã từ khóa Tokyo (A–Z)</p>
              </button>

              <button
                onClick={startMemory}
                className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 text-left space-y-2"
              >
                <Sparkles className="w-5 h-5 text-emerald-500" />
                <p className="text-xs font-bold">Lật thẻ Nhân vật</p>
                <p className="text-[10px] text-zinc-500">Ghép đôi các nhân vật AI</p>
              </button>

              <button
                onClick={() => {
                  setVnNode('start');
                  setVnScore(0);
                  setMode('vn');
                }}
                className="p-3.5 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 text-left space-y-2"
              >
                <BookHeart className="w-5 h-5 text-sky-500" />
                <p className="text-xs font-bold">Visual Novel</p>
                <p className="text-[10px] text-zinc-500">Đêm mưa cùng Yuki</p>
              </button>
            </div>

            <div className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Điểm cao gần đây</h2>
              {(data?.gameScores || []).slice(0, 8).map((s) => (
                <div
                  key={s.id}
                  className="p-3 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <p className="font-semibold">{GAME_LABELS[s.game_id] || s.game_id.replace('_', ' ')}</p>
                    <p className="text-[10px] text-zinc-500">{s.detail}</p>
                  </div>
                  <span className="font-mono-num font-bold text-[#A78BFA]">{s.score} điểm</span>
                </div>
              ))}
            </div>
          </>
        )}

        {mode === 'trivia' && (
          <div className="p-4 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-4">
            {!triviaDone ? (
              <>
                <div className="flex justify-between text-[11px] text-zinc-500">
                  <span>Câu hỏi {qIdx + 1} / {TRIVIA_Q.length}</span>
                  <span className="font-mono-num">Điểm: {triviaScore}</span>
                </div>
                <p className="text-sm font-bold">{TRIVIA_Q[qIdx].q}</p>
                <div className="space-y-2">
                  {TRIVIA_Q[qIdx].opts.map((opt, idx) => (
                    <button
                      key={opt}
                      onClick={() => {
                        const nextScore = idx === TRIVIA_Q[qIdx].ans ? triviaScore + 50 : triviaScore;
                        setTriviaScore(nextScore);
                        if (qIdx + 1 < TRIVIA_Q.length) {
                          setQIdx(qIdx + 1);
                        } else {
                          setTriviaDone(true);
                          saveScore('trivia_quiz', nextScore, `Đã trả lời ${TRIVIA_Q.length} câu hỏi`);
                        }
                      }}
                      className="w-full text-left px-3.5 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 hover:bg-[#A78BFA]/20 text-xs font-medium"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-6 space-y-3">
                <Trophy className="w-10 h-10 text-amber-500 mx-auto" />
                <h3 className="text-base font-bold">Hoàn thành đố vui!</h3>
                <p className="text-sm font-mono-num text-[#A78BFA]">{triviaScore} điểm</p>
                <button
                  onClick={() => {
                    setQIdx(0);
                    setTriviaScore(0);
                    setTriviaDone(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-[#A78BFA] text-white text-xs font-bold"
                >
                  Chơi lại
                </button>
              </div>
            )}
          </div>
        )}

        {mode === 'word' && (
          <div className="p-4 rounded-2xl bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800 space-y-4 text-center">
            <p className="text-xs text-zinc-500">Số lỗi: {mistakes} / 6</p>
            <div className="flex justify-center gap-2 py-2">
              {targetWord.split('').map((ch, i) => (
                <div
                  key={i}
                  className="w-9 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-base font-bold font-mono-num"
                >
                  {guessed.includes(ch) || wordLost ? ch : '_'}
                </div>
              ))}
            </div>
            {(wordWon || wordLost) && (
              <div className="space-y-2">
                <p className={`text-xs font-bold ${wordWon ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {wordWon ? 'Chúc mừng, bạn đã giải đúng!' : `Hết lượt — từ khóa là ${targetWord}`}
                </p>
                <button
                  onClick={() => {
                    const w = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
                    setTargetWord(w);
                    setGuessed([]);
                    setMistakes(0);
                  }}
                  className="px-4 py-1.5 rounded-xl bg-[#A78BFA] text-white text-xs font-bold inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Từ tiếp theo
                </button>
              </div>
            )}
            <div className="grid grid-cols-7 gap-1.5">
              {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => {
                const used = guessed.includes(letter);
                return (
                  <button
                    key={letter}
                    disabled={used || wordWon || wordLost}
                    onClick={() => {
                      const nextGuessed = [...guessed, letter];
                      setGuessed(nextGuessed);
                      if (!targetWord.includes(letter)) {
                        setMistakes((m) => m + 1);
                      } else if (targetWord.split('').every((c) => nextGuessed.includes(c))) {
                        saveScore('word_guess', Math.max(40, 180 - mistakes * 20), `Từ khóa: ${targetWord}`);
                      }
                    }}
                    className={`py-2 rounded-lg text-xs font-bold ${
                      used ? 'bg-zinc-200 dark:bg-zinc-800 opacity-40' : 'bg-zinc-100 dark:bg-zinc-900 hover:bg-[#A78BFA]/20'
                    }`}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {mode === 'memory' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span>Số lượt: <strong className="font-mono-num">{moves}</strong></span>
              <button onClick={startMemory} className="text-[#A78BFA] font-semibold">Chơi lại</button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {shuffled.map((card) => {
                const isUp = flipped.includes(card.uid) || matched.includes(card.key);
                return (
                  <button
                    key={card.uid}
                    onClick={() => handleFlipCard(card.uid)}
                    className="aspect-square rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#1A1A22] flex items-center justify-center"
                  >
                    {isUp ? (
                      <img src={card.avatar} alt={card.name} className="w-full h-full object-cover" />
                    ) : (
                      <Sparkles className="w-5 h-5 text-[#A78BFA]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {mode === 'vn' && (
          <div className="rounded-3xl overflow-hidden bg-white dark:bg-[#1A1A22] border border-zinc-200 dark:border-zinc-800">
            <div className="relative aspect-[4/3] max-h-60 w-full">
              <img
                src="/src/assets/images/char_yuki_1794880089308.jpg"
                alt="Yuki"
                className="w-full h-full object-cover object-top"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
              <div className="absolute bottom-3 left-3 text-white">
                <p className="text-xs font-bold">{VN_NODES[vnNode].speaker}</p>
                <p className="text-[10px] text-white/70 font-mono-num">Điểm thiện cảm: {vnScore}</p>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs leading-relaxed">{VN_NODES[vnNode].text}</p>
              <div className="space-y-2">
                {VN_NODES[vnNode].choices ? (
                  VN_NODES[vnNode].choices!.map((ch) => (
                    <button
                      key={ch.label}
                      onClick={() => {
                        const nextTotal = vnScore + ch.pts;
                        setVnScore(nextTotal);
                        setVnNode(ch.next);
                        if (ch.next === 'end_happy') {
                          saveScore('visual_novel', nextTotal, 'Tuyến buổi tối Shibuya');
                        }
                      }}
                      className="w-full text-left px-3.5 py-2.5 rounded-xl bg-[#A78BFA]/15 text-[#A78BFA] text-xs font-semibold"
                    >
                      {ch.label}
                    </button>
                  ))
                ) : (
                  <button
                    onClick={() => {
                      setVnNode('start');
                      setVnScore(0);
                    }}
                    className="w-full py-2.5 rounded-xl bg-[#A78BFA] text-white text-xs font-bold"
                  >
                    Chơi lại câu chuyện
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
