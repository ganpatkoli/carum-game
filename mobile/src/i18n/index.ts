import { create } from 'zustand';

/** Add a language by adding a dictionary here — no component changes needed. */
export const dictionaries = {
  en: {
    'tab.home': 'Home', 'tab.play': 'Play', 'tab.leaderboard': 'Leaderboard', 'tab.rewards': 'Rewards', 'tab.profile': 'Profile',
    'brand.name': 'CARROM ARENA', 'brand.tagline': 'Play. Strike. Win.',
    'home.quickPlay': 'Quick Play', 'home.friends': 'Play with Friends', 'home.privateRoom': 'Private Room', 'home.practice': 'Practice Mode',
    'play.vsAi': 'Play vs AI', 'play.easy': 'Easy', 'play.medium': 'Medium', 'play.hard': 'Hard', 'play.expert': 'Expert',
    'game.yourTurn': 'Your turn', 'game.opponentTurn': 'Opponent’s turn', 'game.thinking': 'Thinking…', 'game.foul': 'Foul!', 'game.queen': 'Queen!',
    'game.win': 'You win!', 'game.lose': 'You lost', 'game.draw': 'Draw', 'game.playAgain': 'Play again', 'game.opponentDisconnected': 'Opponent disconnected',
    'state.loading': 'Loading…', 'state.empty': 'Nothing here yet', 'state.error': 'Something went wrong', 'state.retry': 'Retry',
    'rewards.claim': 'Claim daily reward', 'wallet.balance': 'Balance',
  },
  hi: {
    'tab.home': 'होम', 'tab.play': 'खेलें', 'tab.leaderboard': 'लीडरबोर्ड', 'tab.rewards': 'इनाम', 'tab.profile': 'प्रोफ़ाइल',
    'brand.name': 'कैरम एरीना', 'brand.tagline': 'खेलो. मारो. जीतो.',
    'home.quickPlay': 'क्विक प्ले', 'home.friends': 'दोस्तों के साथ खेलें', 'home.privateRoom': 'प्राइवेट रूम', 'home.practice': 'प्रैक्टिस मोड',
    'play.vsAi': 'AI के खिलाफ खेलें', 'play.easy': 'आसान', 'play.medium': 'मध्यम', 'play.hard': 'कठिन', 'play.expert': 'विशेषज्ञ',
    'game.yourTurn': 'आपकी बारी', 'game.opponentTurn': 'विरोधी की बारी', 'game.thinking': 'सोच रहा है…', 'game.foul': 'फ़ाउल!', 'game.queen': 'क्वीन!',
    'game.win': 'आप जीते!', 'game.lose': 'आप हार गए', 'game.draw': 'बराबरी', 'game.playAgain': 'फिर खेलें', 'game.opponentDisconnected': 'विरोधी डिस्कनेक्ट हो गया',
    'state.loading': 'लोड हो रहा है…', 'state.empty': 'अभी कुछ नहीं', 'state.error': 'कुछ गलत हो गया', 'state.retry': 'पुनः प्रयास करें',
    'rewards.claim': 'दैनिक इनाम लें', 'wallet.balance': 'बैलेंस',
  },
} as const;

export type Lang = keyof typeof dictionaries;
export type Key = keyof (typeof dictionaries)['en'];

export const useLang = create<{ lang: Lang; setLang: (l: Lang) => void }>((set) => ({ lang: 'en', setLang: (lang) => set({ lang }) }));

export function useT() {
  const lang = useLang((s) => s.lang);
  return (k: Key) => (dictionaries[lang] as Record<string, string>)[k] ?? dictionaries.en[k];
}
