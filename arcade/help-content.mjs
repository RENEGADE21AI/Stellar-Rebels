const updated = 'November 22, 2026';
const email = 'renegade21ai@gmail.com';
const article = (heading, ...paragraphs) => ({ heading, paragraphs: paragraphs.map((text) => typeof text === 'string' ? { text } : text) });
const contact = { text: 'Contact the Stellar Rebels developer at', email };

export const helpPages = {
  privacy: {
    title: 'Privacy Policy', updated,
    intro: 'This policy covers Stellar Rebels, published by RENEGADE21AI, on the web and in the mobile app. You can play as a guest.',
    sections: [
      article('Your pilot and progress', 'The game stores your call sign, preferences, progression, scores, and unfinished attempt information in its storage on this device or browser. Stellar Rebels does not upload those pilot records or synchronize them across devices. Your operating system may include mobile app data in its backups or device transfers.'),
      article('Flight records', 'Flight records can reflect your seed, inputs, equipment and outcome for local verification. The game does not upload flight inputs or publish a leaderboard.'),
      article('Support, retention, and your choices', 'If you contact us, we receive the email address and information you choose to send. We keep that information as needed to respond, resolve the issue, and meet applicable obligations. Avoid sharing passwords, verification codes, or payment card details.', 'Remove a local pilot by clearing the browser’s site data or removing the app and its data. Manage any system backup copies separately. Clearing local data does not cancel a purchase or delete a provider account.', 'Contact us to request access to, correction of, or deletion of personal information. Tell us whether you used the web or mobile version. We may ask for information to verify the request. Some records may need to be kept for legal, security, or transaction obligations.', contact),
      article('Children and updates', 'If you believe a child sent us personal information, contact us so we can review and remove it where required. We will post changes to this policy with a new update date.')
    ],
    webSections: [
      article('Website hosting and Google sign-in', 'Google Firebase hosts the browser game and processes request information such as IP addresses to deliver and secure it. Firebase says its Hosting service retains IP data for a few months.', 'If you choose Google sign-in, Google and Firebase Authentication process the identity information needed for sign-in, which may include your name, email, profile image, account identifier, IP address, and browser details. Stellar Rebels uses that connection to establish your session. Your pilot data stays in this browser. Sign out to end the session. Contact us to request deletion of the Firebase sign-in record.', 'Firebase says Authentication keeps logged IP addresses for a few weeks and keeps other account information until deletion is requested by the project operator. Firebase removes it from live and backup systems within 180 days after deletion is initiated.', { text: 'Read Google’s', link: 'https://firebase.google.com/support/privacy', linkText: 'Firebase privacy and security information' }),
      article('Browser data', 'This site uses browser storage to keep your pilot and cache game files for offline play. Optional Google sign-in uses its own browser storage to maintain the session. You can control this through your browser settings.')
    ],
    nativeSections: [
      article('Mobile purchases and ratings', 'Where purchases are available, Apple or Google handles checkout, payment, and refunds. The app does not receive card details. RevenueCat processes a randomly assigned app user ID and purchase information such as the store, product, receipt or purchase token, and transaction history to check, restore, and report on purchases. The mobile game does not ask you to create a game account.', 'The purchase services receive data over encrypted connections. RevenueCat and your store retain purchase information to operate and secure their services and meet applicable obligations. Contact us for a RevenueCat data request or use your store account to manage its purchase history. A store rating is handled by the store you open.', { text: 'Read', link: 'https://www.revenuecat.com/privacy', linkText: 'RevenueCat’s privacy policy' }),
      article('Ads and tracking', 'Stellar Rebels does not run ads or use cross-app advertising tracking. Purchase reporting is used to operate the mobile unlock and understand purchase activity.')
    ]
  },
  terms: {
    title: 'Terms of Use', updated,
    intro: 'These terms apply when you play Stellar Rebels on the web or in the mobile app. The game is published by RENEGADE21AI.',
    sections: [
      article('Playing the game', 'You may use Stellar Rebels for personal entertainment and may share your gameplay recordings and exported replays. Respect the rights of others. Do not distribute unauthorized copies of the game, interfere with its services, alter another player’s records, or bypass purchase and access controls.'),
      article('Free play and the mobile unlock', 'The browser game is free. The mobile game includes the five main missions and three optional Side Operations of Act I, earnable ships and Specials, upgrades, and Practice. Where offered, Full Game Unlock is one purchase that opens the remaining ten main missions and six Side Operations, plus Veteran and Endless after completing the Standard campaign. Your store confirms the local price before purchase. Normal mission-clear requirements still apply.', 'Use Restore Purchases with the store account used to buy the unlock. Store purchase history is separate from your local game save. Availability of transfers and family sharing depends on the store and the offer. Contact the store for refunds under its rules and applicable law.'),
      article('Saves and availability', 'Pilot saves stay on your device or in your browser. Keep backups or replay exports for records you want to retain. Internet access and a supported store may be needed to buy or restore an unlock. Game and service availability may change. Material changes to these terms will be posted with an updated date.'),
      article('Store license and rights', 'Your store’s license and purchase terms apply to apps and purchases from that store. For an app acquired from the App Store, Apple’s standard app license applies where no custom license is supplied. Your mandatory consumer rights continue to apply.', { text: 'Read', link: 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/', linkText: 'Apple’s standard app license' }),
      article('Contact', contact)
    ]
  },
  support: {
    title: 'Support',
    intro: 'Get help with Stellar Rebels, a save, or a mobile purchase.',
    sections: [
      article('Contact the developer', contact, 'Include your device or browser, the app version if available, and the stage or screen where the problem occurred. You can describe the problem without including personal or payment details.'),
      article('Find or restore progress', 'Use the same device and browser profile to return to your pilot. In the mobile app, open Settings, then Full Game Unlock, then Restore Purchases. Sign into the same store account you used to buy it. The store restores eligible purchases. Your call sign, scores, and progress stay on the device.'),
      article('Ask about privacy', 'Email us with the subject Stellar Rebels privacy. Please say whether your request concerns the browser sign-in, an email you sent, or a mobile purchase. We can then guide you to the right information or deletion process.')
    ]
  }
};
