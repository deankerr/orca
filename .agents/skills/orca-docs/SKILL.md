---
name: orca-docs
description: Write, review, and maintain ORCA documentation, including deciding what to remove or update after code changes.
---

# ORCA documentation

Write for agents and project/technology experts unless the project specifies another audience.
Assume readers can inspect code, search the repository, and already have related documentation in context.

## Content

- Document durable decisions, reasons, operational constraints, and surprising limitations.
- Preserve useful observations about the system, its data, and upstream behavior.
- Scope measurements by date, population, and denominator when needed to interpret them.
- Distinguish observations from policy.
- Record uncertainty when it changes interpretation or a decision.
- Omit task-, worktree-, and PR-specific reports, including demo results and temporary overrides.
- Let code explain implementation, types, and control flow.
- Prefer a clearer name or nearby comment when information belongs with the code.
- Update documented facts and conclusions when new evidence or durable decisions change them.
- Add prose only when it contributes useful knowledge beyond the code change itself.
- Delete guidance tied to removed or redesigned code.
- Describe the resulting system without requiring knowledge of discarded designs.
- State what is, retaining exclusions only for critical constraints or likely misunderstandings.
- Keep operational instructions to prerequisites, commands, and meaningful consequences.

## Organization

- Keep writing rules in this skill and project-specific responsibilities and constraints in project instructions.
- Give each fact one home across documentation and instructions.
- Group sections by reader question or responsibility.
- Use headings or introductory prose to establish shared scope for related instructions.
- Split distinct responsibilities into separate files when they can be understood and maintained independently.
- Prefer an existing document that owns the subject before creating a new one.
- Preserve conditions and scope when splitting or moving content.

## References

- Do not use Markdown links.
- Omit documentation indexes and references whose only purpose is navigation.
- Refer to files only when their identity helps explain the subject or locate an operational change.
- Format filenames as inline code, including a path only when the filename is ambiguous.
- Refer to skills by name.

## Form and review

- Use one bullet per coherent instruction or fact, keeping brief, closely related clauses together.
- Keep each bullet on one physical line, at most 120 characters including its marker.
- Use prose for explanations that need connected sentences.
- Use tables for compact references and comparisons.
- Review the finished document for relevance, duplication, scope, and compliance with these rules.
