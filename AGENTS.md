# Repository instructions

## Agent interoperability

For every change to agent instructions, tools, or protocol adapters, check the [AAIF project directory](https://aaif.io/projects) and follow the current upstream specification for each interface this repository implements. Use the AGENTS.md convention for repository guidance. Record the protocol revision and compatibility checks when an interface changes. Treat the documented collection endpoints and response shapes as a contract with the relay and MCP clients. Run the Jest suite and a CI-mode module build after changes.
