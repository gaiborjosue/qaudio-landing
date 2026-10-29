<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Working agreement

Read `AGENTS.md` and `README.md` before starting work. Keep product details in the README rather than duplicating them here.

- Inspect and safeguard existing uncommitted work; never reset or overwrite unrelated changes. Avoid concurrent writers to the same files.
- Maintain monochrome design, minimal user-facing copy, accessible semantics, keyboard interaction, and reduced-motion support. Preserve established animation and component behavior unless the task asks otherwise. Do not add motion/sound control buttons, a category selection arrow, or gratuitous copy.
- Follow the installed Next.js documentation rule above and use proportionate validation.

## Documentation is part of completion

At every meaningful code change, review and update important project information and features. Update `README.md` for changed features, architecture/routes, dependencies/setup, asset sources, and known limitations. Update `AGENTS.md` when durable development conventions or workflow change. Keep both useful and concise. Include a brief note in the final response describing documentation updates or why no update was needed.

## User-designated control chat

The original chat designated by the user is the control/orchestration room. For each new implementation task requested there, create a separate local project chat with scope, context, acceptance criteria, and documentation requirements. Monitor progress, review results, and report back to the user. Sequence tasks touching the same files to avoid concurrent writers.

Use lower reasoning for routine bounded tasks and higher reasoning only when complexity warrants it. Omit the `create_thread` model override and use the configured default unless the user requests a specific model. A user wanting a particular cheaper model can specify it or configure the default; do not invent prices or promise savings.

Implementation chats execute their assigned work without recursively creating chats. This workflow applies to the user-designated control chat and its dispatched work; it does not impose global spawning rules on arbitrary implementation chats.
