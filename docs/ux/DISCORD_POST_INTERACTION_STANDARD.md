# Discord Post & Interaction Standard

## Status
`ACCEPTED — owner decision, 2026-08-04`

## Purpose
All future Discord posts, panels and interactive messages must follow a polished, compact, mobile-first direction similar to the visual references supplied by the owner. The standard is not tied to the orange branding visible in the reference; colors, illustrations and copy will be adapted to V2. The interaction model, hierarchy and level of finish are mandatory.

## Required visual direction
- Dark, premium-looking embed/card presentation that fits Discord's native interface.
- Clear brand header or title strip at the top.
- Short, readable description with strong typographic hierarchy.
- Optional branded banner/hero image where it adds information or identity.
- One coherent card instead of several scattered messages.
- Consistent accent color, iconography, spacing and footer.
- Mobile-first layout: the post must remain clear on a phone without horizontal assumptions or overloaded text.
- Important information must be visible immediately; secondary details may appear after selection or in an ephemeral response.

## Required interaction model
- Use native Discord components: select menus, buttons and modals.
- A select menu must open Discord's native option sheet/list, with clear emoji/icon, label and optional short description for every option.
- The placeholder must clearly communicate the current state, for example `Nie wybrano żadnej opcji`.
- Selecting an option should normally update the same message, show the relevant content, open a modal or return an ephemeral response.
- Keep the persistent panel in one stable message whenever possible.
- Personal confirmations, validation errors and private details should be ephemeral.
- Shared state should update the public message only when the shared state actually changes.
- Main actions should require no more than one or two deliberate interactions.
- Component custom IDs must be stable, namespaced and versionable.

## Explicitly forbidden defaults
- Emoji reactions as the main navigation or action system.
- Reaction-role style interaction when a select menu or button is the correct component.
- Pointless chains of buttons and intermediate screens.
- Publishing a new public message after every click.
- Forcing users to remember slash commands for actions available from a permanent panel.
- Dense walls of text, raw debug-looking embeds or inconsistent styling.
- Multiple competing control panels for the same function.
- Replacing the requested native menu behavior with an improvised reaction workflow.

## Functional pattern
The standard panel should generally follow this order:

1. Branded title/header.
2. One short explanation of the panel's purpose.
3. Optional banner or contextual visual.
4. Native select menu or a small, intentional set of buttons.
5. Footer/status metadata only when useful.

After a selection, the bot should prefer one of these outcomes:

1. Update the same embed with the selected category and relevant actions.
2. Open a modal for data entry.
3. Send an ephemeral result or confirmation.

The bot must not create channel spam merely to simulate navigation.

## Accessibility and clarity
- Labels must describe actions, not internal implementation.
- Emoji may support recognition but cannot be the only meaning carrier.
- Disabled components must explain why the action is unavailable where possible.
- Errors must state what happened and how to correct it.
- Destructive actions require explicit confirmation.

## Product rule
Every Discord module specification must include its intended post layout and interaction flow before implementation. Cursor must not invent a different reaction-based or multi-message flow without an explicit owner decision.
