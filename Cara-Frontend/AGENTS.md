# Project preferences

- Preserve the original Creepster font throughout the site, including forms, buttons, checkout, and orders. Keep Font Awesome for icons. Do not replace the text font without an explicit user request.
- Social profiles are configured in `store-data.js`. Keep only the user's six profiles: LinkedIn, Facebook, WhatsApp, GitHub, Instagram, and Telegram. Instagram and Telegram both use `quvonchbekqos1mov`.
- Preserve the Cara theme, product images, Uzbek text, and UZS pricing when fixing layout and behavior.
- Keep customer-facing copy concise. Show currency beside prices; do not repeat currency explanations or generic price notices across banners, product sections, and footers. Keep material pricing terms in checkout.
- Check frontend changes with `npm test`. Run backend tests with `python -m unittest discover -s tests -v` when changing commerce integration. Use temporary databases for test accounts and orders.
