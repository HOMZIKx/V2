# Discord Post & Interaction Standard

## Status
`ACCEPTED — owner decision, 2026-08-04`

## Purpose
All future Discord posts, panels and interactive messages must be polished, compact, mobile-first and immediately understandable. The supplied screenshots define the expected level of finish and interaction quality, not a visual template to copy.

V2 must build its own recognizable identity: its own color system, iconography, emoji language, banners, illustrations and component composition. The orange FlameCode branding from the reference must not be copied. The interaction model, clarity and level of finish are mandatory; the visual expression must be original.

## Product priority
The order of priorities is mandatory:

1. Correct, reliable and intuitive operation.
2. Minimal number of deliberate interactions.
3. Clear state, feedback and error recovery.
4. Mobile readability and accessibility.
5. Original, premium V2 visual identity.
6. Decorative effects only when they improve comprehension or identity.

A beautiful panel with confusing, fragile or incomplete behavior is unacceptable.

## Original V2 visual identity
- Use a dark, premium base that integrates naturally with Discord.
- Create a distinctive V2 identity rather than reproducing another bot's palette or artwork.
- Use individual accent colors for modules, categories or states where this improves recognition.
- Module colors may differ, but they must come from one coordinated V2 palette and must not look random.
- Color must carry consistent meaning, for example neutral/information, success, warning, error, destructive action and unavailable state.
- Maintain sufficient contrast on desktop and mobile Discord themes.
- Design original banners, separators, icons and supporting graphics for V2 when visuals are justified.
- Avoid generic stock-looking layouts, copied compositions and decorative clutter.
- Do not force one color onto every module if a controlled, individual color identity makes the system clearer.

## Emoji and icon system
- Use an original, consistent set of emojis/icons selected for V2.
- Emojis should improve fast recognition of categories and actions, not decorate every line.
- Prefer dedicated V2 custom emojis where they materially improve identity and clarity.
- Provide readable Unicode or text fallbacks where a custom emoji may be unavailable.
- Do not reuse the exact emoji choices from the visual reference merely because they appear there.
- Do not use random emoji styles from unrelated sets in one panel.
- Emoji may support a label but cannot be the only carrier of meaning.

## Required visual direction
- Clear branded header or title strip.
- Short, readable description with strong information hierarchy.
- Optional branded banner/hero image only where it adds information, orientation or identity.
- One coherent card instead of several scattered messages.
- Consistent spacing, footer treatment, status language and component alignment.
- Mobile-first layout without horizontal assumptions or overloaded text.
- Important information visible immediately; secondary information may appear after selection or in an ephemeral response.
- Visual detail must not reduce scanability or increase the number of required clicks.

## Required interaction model
- Use native Discord components: select menus, buttons and modals.
- A select menu must open Discord's native option sheet/list, with clear icon/emoji, label and optional concise description for each option.
- The placeholder must clearly communicate the current state, for example `Nie wybrano żadnej opcji`.
- Selecting an option should normally update the same message, show the relevant content, open a modal or return an ephemeral response.
- Keep a persistent panel in one stable message whenever possible.
- Personal confirmations, validation errors and private details should be ephemeral.
- Shared state should update the public message only when the shared state actually changes.
- Main actions should require no more than one or two deliberate interactions.
- Component custom IDs must be stable, namespaced and versionable.
- Every interaction must have loading/deferred handling where required, a success state, a clear failure state and a recovery path.
- Buttons and menus must not remain visually active when the action is unavailable.
- Repeated clicks and Discord retries must not duplicate destructive or state-changing operations.
- Expired interactions must fail clearly and provide a direct way to reopen or refresh the panel.
- Permission errors, rate limits and unavailable services must produce understandable feedback instead of silent failure.

## Top-quality behavior requirements
Before a Discord panel is considered complete, verify:

- the main path works on desktop and mobile;
- selection state is preserved or reconstructed correctly;
- the same action cannot accidentally execute twice;
- unauthorized users receive a clear private response;
- destructive actions require explicit confirmation;
- the message remains usable after bot restart where the module requires persistence;
- stale components are refreshed, disabled or rejected safely;
- the panel does not create channel spam;
- labels and feedback describe user outcomes rather than internal implementation;
- every visible action actually works and has been tested.

## Explicitly forbidden defaults
- Emoji reactions as the main navigation or action system.
- Reaction-role style interaction when a select menu or button is the correct component.
- Pointless chains of buttons and intermediate screens.
- Publishing a new public message after every click.
- Forcing users to remember slash commands for actions available from a permanent panel.
- Dense walls of text, raw debug-looking embeds or inconsistent styling.
- Multiple competing control panels for the same function.
- Replacing the requested native menu behavior with an improvised reaction workflow.
- Copying FlameCode colors, emoji choices, graphics, wording or layout one-to-one.
- Prioritizing animation, decoration or branding over reliability and clarity.

## Functional pattern
The standard panel should generally follow this order:

1. Original V2 title/header.
2. One short explanation of the panel's purpose.
3. Optional original banner or contextual visual.
4. Native select menu or a small, intentional set of buttons.
5. Footer/status metadata only when useful.

After a selection, the bot should prefer one of these outcomes:

1. Update the same embed with the selected category and relevant actions.
2. Open a modal for data entry.
3. Send an ephemeral result or confirmation.

The bot must not create channel spam merely to simulate navigation.

## Design approval rule
Before implementing a new Discord module, prepare:

- proposed embed layout;
- exact interaction flow;
- module accent color and its meaning;
- icon/emoji set;
- public versus ephemeral responses;
- loading, empty, success, error, unavailable and destructive states;
- mobile screenshot or preview when implementation reaches the visual stage.

Cursor must not independently choose a copied palette, generic emoji set or different reaction-based flow. Major visual direction is approved with the owner, while implementation details must remain consistent with this standard.
