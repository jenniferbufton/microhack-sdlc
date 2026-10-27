# React + TypeScript + Vite

## Cart and demo checkout

The product page adds items to a browser-persisted cart. Open the cart from
navigation to edit quantities or remove items, then check out with a customer name,
branch, and explicit approved/declined demo payment method. No real card details
are collected and no money is charged.

- Catalog discounts are applied and unit prices rounded half-up to USD cents.
- One optional promotional code can be applied; the API quotes the final total and
  revalidates the code at checkout. Expiry or price conflicts require an explicit
  total review, and successful receipts show the stored discount snapshot.
- The Python API validates prices and creates the order and all line items atomically.
- Declines, cancellation, and errors retain the cart.
- An unresolved attempt locks editing. Retry it with the saved request key after
  network errors or reloads; do not reset storage to bypass an unknown outcome.
- Only unchanged purchased lines are removed after success. Items added or edited
  in another tab are preserved.
- Local storage contains the cart, unresolved attempt, and latest demo receipt
  (including customer name). Use demo names on shared browsers. Cart edits or the
  cart reset action remove the prior receipt; resetting is blocked while an
  attempt is unresolved.
- Storage failures are shown explicitly. Cart editing can continue in memory, but
  checkout requires successfully persisted state.

Run the frontend in Docker at `http://localhost:8080`, with the Python API enabled
for mock payments. See [the Docker checkout guide](../docs/build.md#docker-frontend-and-demo-checkout)
for build, environment, and browser-test commands. Runtime API hosts must be
reachable from the **browser**, not just the frontend container.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config({
  plugins: {
    // Add the react-x and react-dom plugins
    'react-x': reactX,
    'react-dom': reactDom,
  },
  rules: {
    // other rules...
    // Enable its recommended typescript rules
    ...reactX.configs['recommended-typescript'].rules,
    ...reactDom.configs.recommended.rules,
  },
})
```
