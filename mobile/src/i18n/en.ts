/** Source of truth for UI strings. Add a language by creating a file typed `Dictionary` and registering it in index.ts. */
export const en = {
  // common
  'common.ok': 'OK', 'common.cancel': 'Cancel', 'common.save': 'Save', 'common.back': 'Back', 'common.next': 'Next', 'common.done': 'Done',
  'common.close': 'Close', 'common.copy': 'Copy', 'common.share': 'Share', 'common.yes': 'Yes', 'common.no': 'No', 'common.send': 'Send',
  'common.search': 'Search', 'common.you': 'You', 'common.coins': 'Coins', 'common.continue': 'Continue', 'common.change': 'Change',
  'state.loading': 'Loading…', 'state.empty': 'Nothing here yet', 'state.error': 'Something went wrong', 'state.retry': 'Retry', 'state.offline': 'You appear to be offline',
  // brand
  'brand.name': 'CARROM ARENA', 'brand.tagline': 'Play. Strike. Win.',
  // tabs
  'tab.home': 'Home', 'tab.play': 'Play', 'tab.leaderboard': 'Leaderboard', 'tab.rewards': 'Rewards', 'tab.profile': 'Profile',
  // auth
  'auth.login': 'Log in', 'auth.register': 'Create account', 'auth.identifier': 'Mobile number or email', 'auth.password': 'Password',
  'auth.forgot': 'Forgot password?', 'auth.noAccount': 'New here? Create an account', 'auth.haveAccount': 'Already have an account? Log in',
  'auth.or': 'or', 'auth.google': 'Continue with Google', 'auth.apple': 'Continue with Apple', 'auth.invalid': 'Wrong details, please try again',
  'auth.step': 'Step {n} of {total}',
  'reg.name.title': 'What is your name?', 'reg.name.label': 'Full name',
  'reg.phone.title': 'Your mobile number', 'reg.phone.hint': 'Include country code, e.g. +919876543210', 'reg.phone.send': 'Send code',
  'reg.otp.title': 'Enter the 6-digit code', 'reg.otp.hint': 'We sent a code to {target}', 'reg.otp.resend': 'Resend code', 'reg.otp.devCode': 'Test code: {code}',
  'reg.email.title': 'Your email', 'reg.email.label': 'Email address',
  'reg.password.title': 'Set a password', 'reg.password.hint': 'At least 8 characters', 'reg.password.confirm': 'Confirm password', 'reg.password.mismatch': 'Passwords do not match',
  'reg.username.title': 'Choose a username', 'reg.username.label': 'Username', 'reg.username.available': 'Available', 'reg.username.taken': 'Already taken', 'reg.username.rule': '3–20 letters, numbers or _',
  'reg.avatar.title': 'Pick your avatar',
  'reg.profile.title': 'Almost done', 'reg.profile.country': 'Country code (e.g. IN)', 'reg.profile.language': 'Language', 'reg.profile.finish': 'Start playing',
  'forgot.title': 'Reset your password', 'forgot.send': 'Send reset code', 'forgot.code': 'Code', 'forgot.new': 'New password', 'forgot.done': 'Password updated. Please log in.',
  // home
  'home.hello': 'Hello, {name}', 'home.level': 'Level {n}', 'home.quickPlay': 'Quick Play', 'home.friends': 'Play with Friends', 'home.privateRoom': 'Private Room',
  'home.practice': 'Practice Mode', 'home.dailyMission': 'Daily Mission', 'home.streak': 'Current streak', 'home.days': '{n} days', 'home.leaderboard': 'Top players',
  'home.recent': 'Recent matches', 'home.noRecent': 'Play your first match!', 'home.banner': 'Weekend Tournament', 'home.bannerSub': 'Win matches and climb the weekly board',
  'home.event': 'Featured event', 'home.eventSub': 'Double XP on all ranked wins', 'home.seeAll': 'See all',
  // play
  'play.title': 'Choose a mode', 'play.quick': 'Quick Match', 'play.quickSub': 'Find a random opponent', 'play.friend': 'Play with Friend', 'play.friendSub': 'Invite someone from your friends',
  'play.room': 'Private Room', 'play.roomSub': 'Create or join with a room code', 'play.ai': 'Play vs AI', 'play.aiSub': 'Offline practice, no internet needed',
  'play.easy': 'Easy', 'play.medium': 'Medium', 'play.hard': 'Hard', 'play.expert': 'Expert', 'play.entry': 'Entry fee', 'play.free': 'Free', 'play.pot': 'Winner takes {n} coins',
  'play.notEnough': 'Not enough coins', 'play.practiceNote': 'Practice games do not give rewards or rating.',
  // matchmaking
  'mm.searching': 'Finding an opponent…', 'mm.found': 'Opponent found!', 'mm.startingIn': 'Starting in {n}', 'mm.cancel': 'Cancel', 'mm.botNote': 'No one around? We will find you a practice partner.',
  'mm.waited': 'Waited {n}s',
  // game
  'game.yourTurn': 'Your turn', 'game.opponentTurn': 'Opponent’s turn', 'game.thinking': 'Thinking…', 'game.foul': 'Foul!', 'game.queen': 'Queen!', 'game.queenCover': 'Cover the queen!',
  'game.queenReturned': 'Queen returned', 'game.win': 'Victory!', 'game.lose': 'Defeat', 'game.draw': 'Draw', 'game.playAgain': 'Play again', 'game.home': 'Home',
  'game.disconnected': 'Opponent disconnected', 'game.reconnectIn': 'Waiting for them to come back…', 'game.reconnecting': 'Reconnecting…', 'game.paused': 'Game paused',
  'game.powerAim': 'POWER AIM', 'game.menu': 'Menu', 'game.resign': 'Resign', 'game.resignConfirm': 'Leave this match? You will lose.', 'game.resume': 'Resume',
  'game.rating': 'Rating', 'game.xp': 'XP', 'game.levelUp': 'Level up! You reached level {n}', 'game.coinsWon': 'Coins', 'game.achievement': 'Achievement unlocked: {name}',
  'game.unranked': 'Unranked match', 'game.timeLeft': 'Time left', 'game.report': 'Report player', 'game.mute': 'Mute chat', 'game.unmute': 'Unmute chat', 'game.go': 'GO!',
  'game.dragHint': 'Slide the striker on your line, then pull back to aim', 'game.emotes': 'Emotes', 'game.chat': 'Quick chat', 'game.matchOver': 'Match over',
  'game.turnSkipped': 'Turn skipped', 'game.opponentLeft': 'Your opponent left the match', 'game.timeUp': 'Time is up', 'game.waitingFor': 'Waiting for {name}…',
  'game.yourScore': 'You', 'game.theirScore': 'Opponent', 'game.team': 'Team',
  'chat.good_luck': 'Good luck!', 'chat.nice_shot': 'Nice shot!', 'chat.well_played': 'Well played', 'chat.hurry_up': 'Hurry up!', 'chat.oops': 'Oops!', 'chat.thanks': 'Thanks!',
  'emote.thumbs_up': '👍', 'emote.laugh': '😂', 'emote.fire': '🔥', 'emote.gg': 'GG', 'emote.nice': 'Nice!', 'emote.oops': 'Oops!',
  // rooms
  'room.create': 'Create room', 'room.join': 'Join room', 'room.code': 'Room code', 'room.enterCode': 'Enter room code', 'room.players': 'Players', 'room.p2': '2 players', 'room.p4': '4 players (2v2)',
  'room.duration': 'Match length', 'room.noLimit': 'No limit', 'room.minutes': '{n} min', 'room.entry': 'Entry coins', 'room.board': 'Board', 'room.rules': 'Rules', 'room.queenCover': 'Queen must be covered',
  'room.waiting': 'Waiting for players…', 'room.ready': 'Ready', 'room.notReady': 'Not ready', 'room.start': 'Start match', 'room.leave': 'Leave room', 'room.host': 'Host', 'room.share': 'Join my Carrom Arena room: {code}',
  'room.invalid': 'That code does not look right', 'room.notFound': 'Room not found or already full', 'room.waitingReady': 'Waiting for everyone to be ready',
  // friends
  'friends.title': 'Friends', 'friends.add': 'Add friend', 'friends.search': 'Search by username or player ID', 'friends.requests': 'Requests', 'friends.accept': 'Accept', 'friends.reject': 'Reject',
  'friends.remove': 'Remove', 'friends.block': 'Block', 'friends.invite': 'Invite', 'friends.online': 'Online', 'friends.offline': 'Offline', 'friends.none': 'No friends yet — search above to add some',
  'friends.sent': 'Request sent', 'friends.accepted': 'You are now friends', 'friends.incoming': 'Incoming', 'friends.outgoing': 'Sent', 'friends.invited': 'Invite sent', 'friends.noResults': 'No players found',
  // rewards
  'rewards.title': 'Rewards', 'rewards.daily': 'Daily reward', 'rewards.claim': 'Claim', 'rewards.claimed': 'Claimed', 'rewards.day': 'Day {n}', 'rewards.comeBack': 'Come back tomorrow',
  'rewards.missions': 'Daily missions', 'rewards.achievements': 'Achievements', 'rewards.watchAd': 'Watch ad for {n} coins', 'rewards.adCooldown': 'Next ad available soon', 'rewards.adUnavailable': 'No ad available right now',
  'rewards.got': '+{n} coins', 'rewards.unlocked': 'Unlocked', 'rewards.locked': 'Locked',
  // wallet
  'wallet.title': 'Wallet', 'wallet.balance': 'Balance', 'wallet.earned': 'Earned', 'wallet.spent': 'Spent', 'wallet.history': 'Transactions',
  'tx.GAME_ENTRY': 'Match entry', 'tx.GAME_WIN': 'Match win', 'tx.GAME_LOSS': 'Match consolation', 'tx.DAILY_REWARD': 'Daily reward', 'tx.MISSION_REWARD': 'Mission reward',
  'tx.ADMIN_ADJUSTMENT': 'Adjustment', 'tx.BONUS': 'Bonus', 'tx.REFUND': 'Refund', 'tx.AD_REWARD': 'Ad reward', 'tx.PURCHASE': 'Purchase',
  // shop
  'shop.title': 'Shop', 'shop.buy': 'Buy', 'shop.equip': 'Equip', 'shop.equipped': 'Equipped', 'shop.owned': 'Owned', 'shop.bought': 'Purchased!', 'shop.coinPacks': 'Coin packs', 'shop.items': 'Items',
  'shop.removeAds': 'Remove ads', 'shop.confirm': 'Buy {name} for {price} coins?', 'shop.notAvailable': 'Purchases are not available right now',
  'cat.STRIKER': 'Strikers', 'cat.BOARD': 'Boards', 'cat.AVATAR': 'Avatars', 'cat.FRAME': 'Frames', 'cat.EFFECT': 'Effects', 'cat.EMOTE': 'Emotes',
  'rarity.COMMON': 'Common', 'rarity.RARE': 'Rare', 'rarity.EPIC': 'Epic', 'rarity.LEGENDARY': 'Legendary',
  // leaderboard
  'lb.global': 'Global', 'lb.weekly': 'Weekly', 'lb.monthly': 'Monthly', 'lb.friends': 'Friends', 'lb.country': 'Country', 'lb.local': 'Local', 'lb.rank': 'Rank', 'lb.wins': 'Wins', 'lb.you': 'Your rank',
  'lb.noCountry': 'Set your country in your profile to see this board',
  // profile
  'profile.stats': 'Statistics', 'profile.played': 'Played', 'profile.won': 'Won', 'profile.lost': 'Lost', 'profile.draws': 'Draws', 'profile.winRate': 'Win rate', 'profile.bestScore': 'Best score',
  'profile.streak': 'Streak', 'profile.longest': 'Longest streak', 'profile.earned': 'Coins earned', 'profile.spent': 'Coins spent', 'profile.ranking': 'Ranking', 'profile.rating': 'Rating',
  'profile.playerId': 'Player ID', 'profile.edit': 'Edit profile', 'profile.name': 'Name', 'profile.username': 'Username', 'profile.changePhoto': 'Change photo', 'profile.avatar': 'Avatar',
  'profile.saved': 'Saved', 'profile.achievements': 'Achievements', 'profile.inventory': 'Inventory', 'profile.completeBanner': 'Complete your profile: choose a username',
  // settings
  'settings.title': 'Settings', 'settings.sound': 'Sound effects', 'settings.music': 'Music', 'settings.vibration': 'Vibration', 'settings.notifications': 'Notifications', 'settings.language': 'Language',
  'settings.privacy': 'Privacy', 'settings.account': 'Account', 'settings.security': 'Security', 'settings.blocked': 'Blocked players', 'settings.help': 'Help & support', 'settings.terms': 'Terms of service',
  'settings.privacyPolicy': 'Privacy policy', 'settings.about': 'About', 'settings.logout': 'Log out', 'settings.changePassword': 'Change password', 'settings.currentPassword': 'Current password',
  'settings.newPassword': 'New password', 'settings.passwordChanged': 'Password changed', 'settings.hideStats': 'Hide my statistics', 'settings.hideOnline': 'Hide my online status',
  'settings.friendRequests': 'Allow friend requests', 'settings.push': 'Push notifications', 'settings.unblock': 'Unblock', 'settings.noBlocked': 'You have not blocked anyone',
  'settings.version': 'Version {v}', 'settings.legalPlaceholder': 'Replace this text with your final legal document before publishing the app.',
  'settings.termsBody': 'By using Carrom Arena you agree to play fairly, not to use cheats or exploits, and not to harass other players. Virtual coins have no cash value. We may suspend accounts that break these rules.',
  'settings.privacyBody': 'We store your profile, match history and device identifiers to run the game, prevent cheating and send notifications you allow. We never sell your data. You can ask us to delete your account from Help & support.',
  'settings.aboutBody': 'Carrom Arena — a multiplayer carrom game with real physics, friends, rooms and tournaments.',
  // support & report
  'support.title': 'Help & support', 'support.new': 'New ticket', 'support.category': 'Category', 'support.description': 'Describe the problem', 'support.attach': 'Attach screenshot', 'support.submit': 'Submit',
  'support.sent': 'Ticket sent. We will reply soon.', 'support.none': 'No tickets yet', 'support.reply': 'Write a reply…', 'support.fromSupport': 'Support', 'support.tooShort': 'Please describe the problem (10+ characters)',
  'support.status.OPEN': 'Open', 'support.status.IN_PROGRESS': 'In progress', 'support.status.RESOLVED': 'Resolved', 'support.status.CLOSED': 'Closed',
  'support.cat.ACCOUNT': 'Account', 'support.cat.PAYMENT': 'Payment', 'support.cat.GAMEPLAY': 'Gameplay', 'support.cat.BUG': 'Bug', 'support.cat.REPORT_APPEAL': 'Report appeal', 'support.cat.OTHER': 'Other',
  'report.title': 'Report player', 'report.CHEATING': 'Cheating', 'report.ABUSE': 'Abuse', 'report.OFFENSIVE': 'Offensive behaviour', 'report.SPAM': 'Spam', 'report.INAPPROPRIATE_USERNAME': 'Inappropriate username',
  'report.OTHER': 'Other', 'report.details': 'Details (optional)', 'report.sent': 'Thanks, we will review your report', 'report.already': 'You already reported this player recently',
  // notifications
  'notif.title': 'Notifications', 'notif.markRead': 'Mark all read', 'notif.none': 'No notifications',
  // misc
  'ad.label': 'Ad', 'ad.watching': 'Ad playing…', 'ad.skip': 'Close', 'net.error': 'Network problem. Check your connection and try again.',
  'result.xpBar': 'Level {n}', 'result.offlineSaved': 'Result saved. It will sync when you are online.',
} as const;

export type Dictionary = Record<keyof typeof en, string>;
