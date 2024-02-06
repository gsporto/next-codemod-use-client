# next-codemod-use-client
  Codemod for removing unnecessary "use client" directives in Next.js projects.

### How it works
  Verify imported components from entrypoint (e.g., layout.tsx, page.tsx) and use import tree information to determine if they're imported by server or client components, subsequently removing unnecessary "use client" directives.
  
## Usage
  ```bash
  # Run in the root of your Next.Js project:
  npx next-codemod-use-client
  ```
---
Created by [@gsporto](https://twitter.com/gs_porto).
