import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  Interaction,
  MessageFlags,
  ModalBuilder,
  PermissionsBitField,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import assert from "assert";

import {
  Chains,
  ChainsById,
  getAdminManageSafesDisplay,
  getAdminManageTokensDisplay,
} from "../../utils";

export type DashboardDeps = {
  userModel: {
    getUser(
      userId: string,
      guildId: string,
    ): Promise<{ chainId: number; address: string }[]>;
    getAddress(
      userId: string,
      guildId: string,
      chainId: number,
    ): Promise<string | undefined>;
    getUsersByChain(
      chainId: number,
      guildId: string,
    ): Promise<{ userId: string; chainId: number; address: string }[]>;
    getUsersByAddress(
      guildId: string,
      address: string,
    ): Promise<{ userId: string; chainId: number; address: string }[]>;
    deleteAddress(
      userId: string,
      guildId: string,
      chainId: number,
    ): Promise<boolean>;
  };
  tokenModel: {
    getTokensByGuild(guildId: string): Promise<any[]>;
  };
  safeModel: {
    getAllAddresses(guildId: string): Promise<any[]>;
  };
  stores: {
    payouts: Record<string, any>;
  };
  ui: {
    lastUserAddressesHub: Record<string, { channelId: string; messageId: string }>;
    pendingAddressOverride: Record<string, { chainId: number; address: string }>;
  };
};

export async function handleDashboardCommand(
  interaction: Interaction,
  deps: DashboardDeps,
): Promise<boolean> {
  if (!interaction.isChatInputCommand()) return false;
  if (interaction.commandName !== "nudl") return false;

  const guildId = interaction.guildId;
  assert(guildId, "This command can only be used within a guild.");

  const userId = interaction.user.id;
  const addresses = await deps.userModel.getUser(userId, guildId);
  const addressLines = addresses.length
    ? addresses
        .map(({ chainId, address }) => {
          const chainName = ChainsById[chainId]?.name ?? String(chainId);
          return `• **${chainName}** (${chainId}) — \`${address}\``;
        })
        .join("\n")
    : "_No addresses set yet._";

  const rows = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("dash:user:add")
        .setLabel("Add / update")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("dash:user:remove")
        .setLabel("Remove")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("dash:home")
        .setLabel("← Back")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  await interaction.reply({
    content: `**Addresses**\n\n${addressLines}`,
    components: rows,
    flags: MessageFlags.Ephemeral,
  });

  // Store the message id so modal submits can return to the hub by editing this message.
  try {
    const msg = await interaction.fetchReply();
    const key = `${guildId}:${userId}`;
    deps.ui.lastUserAddressesHub[key] = {
      channelId: interaction.channelId,
      messageId: msg.id,
    };
  } catch {
    // best effort
  }

  return true;
}

export async function handleDashboardAdminCommand(
  interaction: Interaction,
): Promise<boolean> {
  if (!interaction.isChatInputCommand()) return false;
  if (interaction.commandName !== "nudl-admin") return false;

  if (
    !interaction.memberPermissions?.has(
      PermissionsBitField.Flags.Administrator,
    )
  ) {
    await interaction.reply({
      content: "Admin dashboard requires Administrator permission.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const rows = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("dash:admin:tokens")
        .setLabel("Manage tokens")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("dash:admin:safes")
        .setLabel("Manage safes")
        .setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("dash:admin:payout:start")
        .setLabel("Start payout")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("dash:admin:missing:start")
        .setLabel("Notify missing addresses")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("dash:admin:address-search:start")
        .setLabel("Find users by address")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];

  await interaction.reply({
    content: "**Admin dashboard**\n\nChoose a category:",
    components: rows,
    flags: MessageFlags.Ephemeral,
  });

  return true;
}

export async function handleDashboardButton(
  interaction: Interaction,
  deps: DashboardDeps,
): Promise<boolean> {
  if (!interaction.isButton()) return false;

  if (interaction.customId === "dash:home") {
    const rows = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("dash:user")
          .setLabel("Addresses")
          .setStyle(ButtonStyle.Primary),
      ),
    ];

    await (interaction as ButtonInteraction).update({
      content:
        "**nudl**\n\n" +
        "UI-first dashboard.\n" +
        "Admins: use `/nudl-admin`.\n",
      components: rows,
    });

    return true;
  }

  if (interaction.customId === "dash:user" || interaction.customId === "dash:user:full") {
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;

    const addresses = await deps.userModel.getUser(userId, guildId);

    const showFull = interaction.customId === "dash:user:full";

    const rowsData = [...addresses]
      .sort((a, b) => a.chainId - b.chainId)
      .map(({ chainId, address }) => {
        const chainName = ChainsById[chainId]?.name ?? String(chainId);
        const chainLabel = `${chainName} (${chainId})`;
        const addrLabel = showFull
          ? address
          : `${address.slice(0, 6)}…${address.slice(-4)}`;
        return { chainLabel, addrLabel };
      });

    const chainColWidth = Math.min(
      28,
      Math.max("CHAIN".length, ...rowsData.map((r) => r.chainLabel.length)),
    );

    const addressLines = rowsData.length
      ? "```\\n" +
        "CHAIN".padEnd(chainColWidth) +
        "  " +
        "ADDRESS\\n" +
        rowsData
          .map((r) =>
            r.chainLabel.slice(0, chainColWidth).padEnd(chainColWidth) +
            "  " +
            r.addrLabel,
          )
          .join("\\n") +
        "\\n```"
      : "_No addresses set yet._";

    const rows = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("dash:user:add")
          .setLabel("Add / update")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("dash:user:remove")
          .setLabel("Remove")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(showFull ? "dash:user" : "dash:user:full")
          .setLabel(showFull ? "Hide full" : "Show full")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("dash:home")
          .setLabel("← Back")
          .setStyle(ButtonStyle.Secondary),
      ),
    ];

    await (interaction as ButtonInteraction).update({
      content: `**Addresses**\n\n${addressLines}`,
      components: rows,
    });

    // Track the current hub message.
    const key = `${guildId}:${userId}`;
    deps.ui.lastUserAddressesHub[key] = {
      channelId: interaction.channelId,
      messageId: (interaction as ButtonInteraction).message.id,
    };

    return true;
  }
  if (interaction.customId === "dash:user:remove") {
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;

    const current = await deps.userModel.getUser(userId, guildId);
    const byChain = new Map(current.map((x) => [x.chainId, x.address] as const));

    const networkRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("dash:user:remove:network")
        .setPlaceholder("Select a network to remove...")
        .addOptions(
          Chains.map((c) => {
            const addr = byChain.get(c.chainId);
            const short = addr
              ? `${addr.slice(0, 6)}...${addr.slice(-4)}`
              : "(none set)";
            return {
              label: c.name,
              value: String(c.chainId),
              description: short,
            };
          }),
        ),
    );

    const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("dash:user")
        .setLabel("← Back to Addresses")
        .setStyle(ButtonStyle.Secondary),
    );

    await (interaction as ButtonInteraction).update({
      content: "Pick a network to remove (shows current address):",
      components: [networkRow, backRow],
    });

    return true;
  }

  if (interaction.customId === "dash:user:add") {
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;

    const current = await deps.userModel.getUser(userId, guildId);
    const byChain = new Map(current.map((x) => [x.chainId, x.address] as const));

    // Select a network first (UI replacement for slash command options)
    const networkRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("dash:user:add:network")
        .setPlaceholder("Select a network...")
        .addOptions(
          Chains.map((c) => {
            const addr = byChain.get(c.chainId);
            const short = addr
              ? `${addr.slice(0, 6)}...${addr.slice(-4)}`
              : "(none set)";
            return {
              label: c.name,
              value: String(c.chainId),
              description: short,
            };
          }),
        ),
    );

    const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("dash:user")
        .setLabel("← Back to Addresses")
        .setStyle(ButtonStyle.Secondary),
    );

    await (interaction as ButtonInteraction).update({
      content: "Pick a network to add/update (shows current address):",
      components: [networkRow, backRow],
    });

    return true;
  }

  // confirm removal
  if (interaction.customId.startsWith("dash:user:remove:confirm:")) {
    // customId: dash:user:remove:confirm:<chainId>
    const chainId = Number(interaction.customId.split(":")[4]);
    assert(chainId, "Invalid chain");

    const guildId = interaction.guildId!;
    const userId = interaction.user.id;

    await deps.userModel.deleteAddress(userId, guildId, chainId);

    const chainName = ChainsById[chainId]?.name ?? String(chainId);

    // Return to addresses screen (single-message flow)
    const addresses = await deps.userModel.getUser(userId, guildId);
    const addressLines = addresses.length
      ? addresses
          .map(({ chainId, address }) => {
            const chainName = ChainsById[chainId]?.name ?? String(chainId);
            return `• **${chainName}** (${chainId}) — \`${address}\``;
          })
          .join("\n")
      : "_No addresses set yet._";

    const rows = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("dash:user:add")
          .setLabel("Add / update")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("dash:user:remove")
          .setLabel("Remove")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("dash:home")
          .setLabel("← Back")
          .setStyle(ButtonStyle.Secondary),
      ),
    ];

    await (interaction as ButtonInteraction).update({
      content: `✅ Removed address for **${chainName}** (${chainId}).\n\n**Addresses**\n\n${addressLines}`,
      components: rows,
    });

    return true;
  }

  if (interaction.customId === "dash:admin") {
    if (
      !interaction.memberPermissions?.has(
        PermissionsBitField.Flags.Administrator,
      )
    ) {
      await (interaction as ButtonInteraction).reply({
        content: "Admin dashboard requires Administrator permission.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const rows = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("dash:admin:tokens")
          .setLabel("Manage tokens")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("dash:admin:safes")
          .setLabel("Manage safes")
          .setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("dash:admin:payout:start")
          .setLabel("Start payout")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("dash:admin:missing:start")
          .setLabel("Notify missing addresses")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("dash:admin:address-search:start")
          .setLabel("Find users by address")
          .setStyle(ButtonStyle.Secondary),
      ),
    ];

    await (interaction as ButtonInteraction).update({
      content: "**Admin dashboard**\n\nChoose a category:",
      components: rows,
    });

    return true;
  }

  if (interaction.customId === "dash:admin:tokens") {
    const guild = interaction.guild;
    assert(guild, "This command can only be used within a guild.");

    const allTokens = await deps.tokenModel.getTokensByGuild(guild.id);
    const view = getAdminManageTokensDisplay({ allTokens });

    const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("dash:admin")
        .setLabel("← Back to Backoffice")
        .setStyle(ButtonStyle.Secondary),
    );

    await (interaction as ButtonInteraction).update({
      ...view,
      components: [...(view.components ?? []), backRow],
    });

    return true;
  }

  if (interaction.customId === "dash:admin:safes") {
    const guild = interaction.guild;
    assert(guild, "This command can only be used within a guild.");

    const allSafes = await deps.safeModel.getAllAddresses(guild.id);
    const view = getAdminManageSafesDisplay({ allSafes });

    const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("dash:admin")
        .setLabel("← Back to Backoffice")
        .setStyle(ButtonStyle.Secondary),
    );

    await (interaction as ButtonInteraction).update({
      ...view,
      components: [...(view.components ?? []), backRow],
    });

    return true;
  }

  if (interaction.customId === "dash:admin:missing:start") {
    if (
      !interaction.memberPermissions?.has(
        PermissionsBitField.Flags.Administrator,
      )
    ) {
      await (interaction as ButtonInteraction).reply({
        content: "Admin dashboard requires Administrator permission.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const chainRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("dash:admin:missing:chain")
        .setPlaceholder("Select a network...")
        .addOptions(
          Chains.map((c) => ({
            label: c.name,
            value: String(c.chainId),
            description: c.shortName ? `(${c.shortName})` : undefined,
          })),
        ),
    );

    const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("dash:admin")
        .setLabel("← Back to Backoffice")
        .setStyle(ButtonStyle.Secondary),
    );

    await (interaction as ButtonInteraction).update({
      content:
        "**Notify missing addresses**\n\n" +
        "Step 1: pick a network. Then optionally filter by role.\n" +
        "This tool automatically filters to members who can see *this channel*.\n" +
        "When you click **Send notification**, I’ll post a message in *this channel* tagging missing users.",
      components: [chainRow, backRow],
    });

    return true;
  }

  if (interaction.customId === "dash:admin:address-search:start") {
    const modal = new ModalBuilder()
      .setCustomId("dash:admin:address-search:modal")
      .setTitle("Find users by address");

    const input = new TextInputBuilder()
      .setCustomId("addressInput")
      .setLabel("Wallet address")
      .setPlaceholder("0x...")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(input),
    );

    await (interaction as ButtonInteraction).showModal(modal);
    return true;
  }

  if (interaction.customId === "dash:admin:payout:start") {
    if (
      !interaction.memberPermissions?.has(
        PermissionsBitField.Flags.Administrator,
      )
    ) {
      await (interaction as ButtonInteraction).reply({
        content: "Admin dashboard requires Administrator permission.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const rows = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("dash:admin:payout:platform:safe")
          .setLabel("Safe")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("dash:admin:payout:platform:disperse")
          .setLabel("Disperse")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("dash:admin:payout:platform:csv-airdrop")
          .setLabel("CSV Airdrop")
          .setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("dash:admin")
          .setLabel("← Back to Backoffice")
          .setStyle(ButtonStyle.Secondary),
      ),
    ];

    await (interaction as ButtonInteraction).update({
      content:
        "**Start payout**\n\nChoose platform (we’ll only ask for what’s required):",
      components: rows,
    });

    return true;
  }

  if (interaction.customId.startsWith("dash:admin:payout:platform:")) {
    const platform = interaction.customId.split(":")[4];
    assert(
      platform === "safe" || platform === "disperse" || platform === "csv-airdrop",
      "Invalid platform",
    );

    // Choose network next
    const networkRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`dash:admin:payout:network:${platform}`)
        .setPlaceholder("Select a network...")
        .addOptions(
          Chains.map((c) => ({
            label: c.name,
            value: String(c.chainId),
            description: c.shortName ? `(${c.shortName})` : undefined,
          })),
        ),
    );

    const cancelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("dash:admin")
        .setLabel("Cancel / Back to Backoffice")
        .setStyle(ButtonStyle.Secondary),
    );

    await (interaction as ButtonInteraction).reply({
      content: `Select a network for **${platform}** payout:`,
      components: [networkRow, cancelRow],
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  if (interaction.customId.startsWith("dash:admin:payout:recipients:")) {
    const parts = interaction.customId.split(":");
    const payoutId = parts[4];
    const mode = parts[5];

    const payout = deps.stores.payouts[payoutId];
    assert(payout, "Payout session not found");

    if (mode === "manual") {
      const chainName = ChainsById[payout.chainId]?.name ?? String(payout.chainId);

      const modal = new ModalBuilder()
        .setCustomId(`payoutModal_${payoutId}`)
        .setTitle(`Paste ${payout.type} payout CSV (${chainName})`);

      const input = new TextInputBuilder()
        .setCustomId(`csvInput`)
        .setLabel("Paste CSV (discordid,amount per line)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(input),
      );

      await (interaction as ButtonInteraction).showModal(modal);
      return true;
    }

    // store the chosen mode so selects can update the right fields
    payout.recipientsMode = mode;

    const rows: any[] = [];

    if (mode === "role" || mode === "role-channel") {
      rows.push(
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId(`dash:admin:payout:role:${payoutId}`)
            .setPlaceholder("Select a role…")
            .setMinValues(1)
            .setMaxValues(1),
        ),
      );
    }

    if (mode === "channel" || mode === "role-channel") {
      rows.push(
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId(`dash:admin:payout:channel:${payoutId}`)
            .setPlaceholder("Select a channel…")
            .setMinValues(1)
            .setMaxValues(1),
        ),
      );
    }

    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`dash:admin:payout:prefill:${payoutId}`)
          .setLabel("Prefill CSV (userId,0) + open modal")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("dash:admin")
          .setLabel("Cancel / Back")
          .setStyle(ButtonStyle.Secondary),
      ),
    );

    await (interaction as ButtonInteraction).reply({
      content:
        "Choose recipients. We’ll prefill the CSV with `userId,0` so you only edit amounts.",
      components: rows,
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  if (interaction.customId.startsWith("dash:admin:payout:prefill:")) {
    const payoutId = interaction.customId.split(":")[4];
    const payout = deps.stores.payouts[payoutId];
    assert(payout, "Payout session not found");

    const guild = interaction.guild;
    assert(guild, "This command can only be used within a guild.");

    await guild.members.fetch();

    // Build candidate set from role/channel sources directly (more reliable than filtering the full member list).
    let members: any[] | null = null;

    if (payout.recipientsMode === "role" || payout.recipientsMode === "role-channel") {
      assert(payout.roleId, "Select a role first");
      await guild.roles.fetch();
      const role = guild.roles.cache.get(payout.roleId);
      assert(role, "Role not found");
      members = Array.from(role.members.values()).filter((m) => !m.user.bot);
    }

    if (payout.recipientsMode === "channel" || payout.recipientsMode === "role-channel") {
      assert(payout.channelId, "Select a channel first");
      const ch = await guild.channels.fetch(payout.channelId);
      assert(ch && ch.isTextBased(), "Must be a text channel");
      const channelMembers = Array.from((ch as TextChannel).members.values()).filter(
        (m) => !m.user.bot,
      );

      if (members === null) {
        members = channelMembers;
      } else {
        const channelSet = new Set(channelMembers.map((m) => m.id));
        members = members.filter((m) => channelSet.has(m.id));
      }
    }

    if (members === null) {
      // "all" mode (or defensive fallback): all current guild members with an address on this chain.
      const allMembers = Array.from(guild.members.cache.values()).filter((m) => !m.user.bot);
      const addressed = await deps.userModel.getUsersByChain(payout.chainId, guild.id);
      const addressedIds = new Set(addressed.map((u) => u.userId));
      members = allMembers.filter((m) => addressedIds.has(m.id));
    }

    if (!members.length) {
      const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("dash:admin")
          .setLabel("← Back to Backoffice")
          .setStyle(ButtonStyle.Secondary),
      );

      await (interaction as ButtonInteraction).reply({
        content: "No matching users found for that filter.",
        components: [backRow],
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const prefill = members
      .map((m) => {
        const display = m.displayName || m.user?.username || m.id;
        const uname = m.user?.username;
        return uname ? `${display} (@${uname}),0` : `${display},0`;
      })
      .join("\n");
    const chainName = ChainsById[payout.chainId]?.name ?? String(payout.chainId);

    const modal = new ModalBuilder()
      .setCustomId(`payoutModal_${payoutId}`)
      .setTitle(`Set amounts (${chainName})`);

    const input = new TextInputBuilder()
      .setCustomId(`csvInput`)
      .setLabel("Edit amounts (userId,amount)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setValue(prefill);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(input),
    );

    await (interaction as ButtonInteraction).showModal(modal);
    return true;
  }

  return false;
}

export async function handleDashboardModalSubmit(
  interaction: Interaction,
  deps: DashboardDeps,
): Promise<boolean> {
  if (!interaction.isModalSubmit()) return false;
  if (interaction.customId !== "dash:admin:address-search:modal") return false;

  const guildId = interaction.guildId;
  const guild = interaction.guild;
  assert(guildId, "Guild not found");
  assert(guild, "Guild not found");

  const rawAddress = interaction.fields.getTextInputValue("addressInput").trim();
  const normalizedAddress = rawAddress.toLowerCase();

  // Important: search is scoped to the current guild only.
  const usersWithAddress = await deps.userModel.getUsersByAddress(
    guildId,
    normalizedAddress,
  );

  if (usersWithAddress.length === 0) {
    await interaction.reply({
      content: `No users found for address: ${rawAddress}`,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const grouped = new Map<string, { chainId: number; address: string }[]>();
  for (const entry of usersWithAddress) {
    const existing = grouped.get(entry.userId) ?? [];
    existing.push({ chainId: entry.chainId, address: entry.address });
    grouped.set(entry.userId, existing);
  }

  const lines: string[] = [];
  for (const [userId, entries] of grouped.entries()) {
    let who = `<@${userId}>`;
    let label = userId;

    try {
      const member = await guild.members.fetch(userId);
      who = `<@${member.id}>`;
      label = member.displayName || member.user.username || member.id;
    } catch {
      // Fallback for users not currently in guild member cache/list.
      try {
        const user = await interaction.client.users.fetch(userId);
        // Avoid <@id> mention when not in guild; Discord can render this as @unknown-user.
        who = `@${user.username}`;
        label = user.username || user.id;
      } catch {
        who = `Unknown user`;
        label = `Unknown user (${userId})`;
      }
    }

    const chains = entries
      .sort((a, b) => a.chainId - b.chainId)
      .map((e) => {
        const chainName = ChainsById[e.chainId]?.name ?? String(e.chainId);
        return `${chainName} (${e.chainId})`;
      })
      .join(", ");

    lines.push(`• ${who} — **${label}** (id: \`${userId}\`)\n  Chains: ${chains}`);
  }

  await interaction.reply({
    content:
      `**Users found for address** \`${rawAddress}\`\n` +
      `Matches: **${usersWithAddress.length}** record(s), **${grouped.size}** user(s)\n\n` +
      lines.join("\n"),
    flags: MessageFlags.Ephemeral,
    allowedMentions: { users: Array.from(grouped.keys()) },
  });

  return true;
}

export async function handleDashboardSelectMenu(
  interaction: Interaction,
  deps: DashboardDeps,
): Promise<boolean> {
  if (
    !interaction.isStringSelectMenu() &&
    !interaction.isRoleSelectMenu() &&
    !interaction.isChannelSelectMenu()
  ) {
    return false;
  }

  async function computeMissingUsers(params: {
    chainId: number;
    roleId?: string | null;
  }): Promise<string[]> {
    const { chainId, roleId } = params;

    const guild = interaction.guild;
    assert(guild, "This command can only be used within a guild.");

    const guildId = guild.id;

    // Filter baseline is: members who can see *this* channel.
    const channel = interaction.channel;
    assert(channel && channel.isTextBased(), "Must be a text channel");

    // TextChannel.members is the set of members with visibility.
    const visibleMembers = (channel as TextChannel).members;
    let candidateIds = Array.from(visibleMembers.keys());

    // Remove bots
    candidateIds = candidateIds.filter((id) => {
      const m = visibleMembers.get(id);
      return m ? !m.user.bot : false;
    });

    // Apply role filter if present
    if (roleId) {
      await guild.roles.fetch();
      const roleMembers = guild.roles.cache.get(roleId)?.members;
      if (!roleMembers || roleMembers.size === 0) return [];
      const roleMemberIds = new Set(roleMembers.map((m: any) => m.id));
      candidateIds = candidateIds.filter((id) => roleMemberIds.has(id));
    }

    // Subtract users who already have addresses
    const allAddresses = await deps.userModel.getUsersByChain(chainId, guildId);
    const usersWithAddresses = new Set(allAddresses.map((addr) => addr.userId));

    return candidateIds.filter((id) => !usersWithAddresses.has(id));
  }

  function renderMissingWizard(params: {
    chainId: number;
    roleId?: string | null;
    missingUserIds: string[];
  }) {
    const { chainId, roleId, missingUserIds } = params;
    const chainName = ChainsById[chainId]?.name ?? String(chainId);

    const previewMentions = missingUserIds
      .slice(0, 10)
      .map((id) => `<@${id}>`)
      .join(" ");

    const roleLabel = roleId ? `<@&${roleId}>` : "(none)";

    const content =
      `**Notify missing addresses** — ${chainName} (${chainId})\n\n` +
      `Channel: <#${interaction.channelId}> (auto-filtered by visibility)\n` +
      `Role filter: ${roleLabel}\n\n` +
      `Missing: **${missingUserIds.length}** users\n` +
      (previewMentions ? `Preview: ${previewMentions}` : "Preview: (none)");

    const rows: any[] = [];

    rows.push(
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(`dash:admin:missing:role:chain:${chainId}`)
          .setPlaceholder("Optional: filter by role…")
          .setMinValues(1)
          .setMaxValues(1),
      ),
    );

    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(
            `notifyMissing_chain:${chainId}_role:${roleId ?? "none"}_channel:${interaction.channelId}`,
          )
          .setLabel("Send notification")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(missingUserIds.length === 0),
        new ButtonBuilder()
          .setCustomId("dash:admin")
          .setLabel("← Back to Backoffice")
          .setStyle(ButtonStyle.Secondary),
      ),
    );

    return { content, components: rows };
  }

  if (interaction.customId === "dash:admin:missing:chain") {
    const chainId = Number(interaction.values[0]);
    assert(chainId, "Invalid chain");

    const missingUserIds = await computeMissingUsers({ chainId });
    if (missingUserIds[0] === "__RATE_LIMIT__") {
      const retryAfter = Number(missingUserIds[1] ?? 0);
      const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("dash:admin:missing:start")
          .setLabel("← Back")
          .setStyle(ButtonStyle.Secondary),
      );
      await (interaction as StringSelectMenuInteraction).update({
        content: `Discord gateway rate limit hit while fetching members. Try again in ~${Math.ceil(
          retryAfter,
        )}s.`,
        components: [backRow],
      });
      return true;
    }

    const view = renderMissingWizard({ chainId, missingUserIds });

    await (interaction as StringSelectMenuInteraction).update(view);
    return true;
  }

  if (interaction.customId.startsWith("dash:admin:missing:role:chain:")) {
    const parts = interaction.customId.split(":");
    const chainId = Number(parts[5]);
    assert(chainId, "Invalid chain");

    const roleId = (interaction as any).values?.[0];
    const missingUserIds = await computeMissingUsers({ chainId, roleId });

    const view = renderMissingWizard({ chainId, roleId, missingUserIds });

    await (interaction as any).update(view);
    return true;
  }

  if (interaction.customId === "dash:user:add:network") {
    const chainId = Number(interaction.values[0]);
    assert(chainId, "Invalid chain");

    const guildId = interaction.guildId!;
    const userId = interaction.user.id;

    const chainName = ChainsById[chainId]?.name ?? String(chainId);
    const existing = await deps.userModel.getAddress(userId, guildId, chainId);

    // Reuse existing modal submit handling by using the legacy customId: addAddress_<chainId>
    const modal = new ModalBuilder()
      .setCustomId(`addAddress_${chainId}`)
      .setTitle(
        `${existing ? "Update" : "Add"} Address — ${chainName} (${chainId})`,
      );

    const input = new TextInputBuilder()
      .setCustomId("addressInput")
      .setLabel(existing ? "New address (will ask to confirm override)" : "Address")
      .setPlaceholder(existing ? existing : "0x…")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(input),
    );

    await (interaction as StringSelectMenuInteraction).showModal(modal);
    return true;
  }

  if (interaction.customId === "dash:user:remove:network") {
    const chainId = Number(interaction.values[0]);
    assert(chainId, "Invalid chain");

    const guildId = interaction.guildId!;
    const userId = interaction.user.id;

    const chainName = ChainsById[chainId]?.name ?? String(chainId);
    const existing = await deps.userModel.getAddress(userId, guildId, chainId);

    if (!existing) {
      const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("dash:user")
          .setLabel("← Back to Addresses")
          .setStyle(ButtonStyle.Secondary),
      );

      await (interaction as StringSelectMenuInteraction).update({
        content: `No address is set for **${chainName}** (${chainId}).`,
        components: [backRow],
      });
      return true;
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`dash:user:remove:confirm:${chainId}`)
        .setLabel(`Yes, remove`) 
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("dash:user")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary),
    );

    await (interaction as StringSelectMenuInteraction).update({
      content:
        `**Confirm removal** — ${chainName} (${chainId})\n\n` +
        `Current: \`${existing}\`\n\n` +
        `Remove this address?`,
      components: [row],
    });

    return true;
  }

  if (interaction.customId.startsWith("dash:admin:payout:network:")) {
    const platform = interaction.customId.split(":")[4];
    assert(
      platform === "safe" || platform === "disperse" || platform === "csv-airdrop",
      "Invalid platform",
    );

    const chainId = Number((interaction as any).values[0]);
    assert(chainId, "Invalid chain");

    // Create payout session configured by platform + chain
    const payoutId = String(Date.now());
    deps.stores.payouts[payoutId] = {
      id: payoutId,
      type: platform,
      chainId,
      list: [],
      csvData: "",
      donateAmount: 0,
    };

    const chainName = ChainsById[chainId]?.name ?? String(chainId);

    const rows = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`dash:admin:payout:recipients:${payoutId}:manual`)
          .setLabel("Manual paste")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`dash:admin:payout:recipients:${payoutId}:all`)
          .setLabel("All with addresses")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`dash:admin:payout:recipients:${payoutId}:role`)
          .setLabel("By role")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`dash:admin:payout:recipients:${payoutId}:channel`)
          .setLabel("By channel")
          .setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`dash:admin:payout:recipients:${payoutId}:role-channel`)
          .setLabel("Role + channel")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("dash:admin")
          .setLabel("Cancel / Back")
          .setStyle(ButtonStyle.Secondary),
      ),
    ];

    await (interaction as any).update({
      content:
        `**Recipients** — ${platform} on **${chainName}**\n\n` +
        `Choose how to build the recipient list.`,
      components: rows,
    });

    return true;
  }

  if (interaction.customId.startsWith("dash:admin:payout:role:")) {
    const payoutId = interaction.customId.split(":")[4];
    const payout = deps.stores.payouts[payoutId];
    assert(payout, "Payout session not found");

    const guild = interaction.guild;
    assert(guild, "This command can only be used within a guild.");

    payout.roleId = (interaction as any).values?.[0];

    await guild.roles.fetch();
    const role = guild.roles.cache.get(payout.roleId);
    assert(role, "Role not found");

    let members = Array.from(role.members.values()).filter((m) => !m.user.bot);

    // If role+channel mode and channel already selected, intersect.
    if (payout.recipientsMode === "role-channel" && payout.channelId) {
      const ch = await guild.channels.fetch(payout.channelId);
      assert(ch && ch.isTextBased(), "Must be a text channel");
      const channelMembers = Array.from((ch as TextChannel).members.values()).filter(
        (m) => !m.user.bot,
      );
      const channelSet = new Set(channelMembers.map((m) => m.id));
      members = members.filter((m) => channelSet.has(m.id));
    }

    const count = members.length;
    const preview = members
      .slice(0, 10)
      .map((m) => `<@${m.id}>`)
      .join(" ");

    const rows: any[] = [];

    if (payout.recipientsMode === "role" || payout.recipientsMode === "role-channel") {
      rows.push(
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId(`dash:admin:payout:role:${payoutId}`)
            .setPlaceholder("Select a role…")
            .setMinValues(1)
            .setMaxValues(1),
        ),
      );
    }

    if (payout.recipientsMode === "channel" || payout.recipientsMode === "role-channel") {
      rows.push(
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId(`dash:admin:payout:channel:${payoutId}`)
            .setPlaceholder("Select a channel…")
            .setMinValues(1)
            .setMaxValues(1),
        ),
      );
    }

    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`dash:admin:payout:prefill:${payoutId}`)
          .setLabel("Prefill CSV (userId,0) + open modal")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(count === 0),
        new ButtonBuilder()
          .setCustomId("dash:admin")
          .setLabel("Cancel / Back")
          .setStyle(ButtonStyle.Secondary),
      ),
    );

    await (interaction as any).update({
      content:
        `Role selected: <@&${payout.roleId}>\n` +
        `Matching users: **${count}**` +
        (count ? `\nPreview: ${preview}` : "\n_No users found for that filter._"),
      components: rows,
      allowedMentions: { users: members.slice(0, 10).map((m) => m.id), roles: [] },
    });

    return true;
  }

  if (interaction.customId.startsWith("dash:admin:payout:channel:")) {
    const payoutId = interaction.customId.split(":")[4];
    const payout = deps.stores.payouts[payoutId];
    assert(payout, "Payout session not found");

    const guild = interaction.guild;
    assert(guild, "This command can only be used within a guild.");

    payout.channelId = (interaction as any).values?.[0];

    const ch = await guild.channels.fetch(payout.channelId);
    assert(ch && ch.isTextBased(), "Must be a text channel");

    let members = Array.from((ch as TextChannel).members.values()).filter((m) => !m.user.bot);

    // If role+channel mode and role already selected, intersect.
    if (payout.recipientsMode === "role-channel" && payout.roleId) {
      await guild.roles.fetch();
      const role = guild.roles.cache.get(payout.roleId);
      assert(role, "Role not found");
      const roleSet = new Set(Array.from(role.members.keys()));
      members = members.filter((m) => roleSet.has(m.id));
    }

    const count = members.length;
    const preview = members
      .slice(0, 10)
      .map((m) => `<@${m.id}>`)
      .join(" ");

    const rows: any[] = [];

    if (payout.recipientsMode === "role" || payout.recipientsMode === "role-channel") {
      rows.push(
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId(`dash:admin:payout:role:${payoutId}`)
            .setPlaceholder("Select a role…")
            .setMinValues(1)
            .setMaxValues(1),
        ),
      );
    }

    if (payout.recipientsMode === "channel" || payout.recipientsMode === "role-channel") {
      rows.push(
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId(`dash:admin:payout:channel:${payoutId}`)
            .setPlaceholder("Select a channel…")
            .setMinValues(1)
            .setMaxValues(1),
        ),
      );
    }

    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`dash:admin:payout:prefill:${payoutId}`)
          .setLabel("Prefill CSV (userId,0) + open modal")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(count === 0),
        new ButtonBuilder()
          .setCustomId("dash:admin")
          .setLabel("Cancel / Back")
          .setStyle(ButtonStyle.Secondary),
      ),
    );

    await (interaction as any).update({
      content:
        `Channel selected: <#${payout.channelId}>\n` +
        `Matching users: **${count}**` +
        (count ? `\nPreview: ${preview}` : "\n_No users found for that filter._"),
      components: rows,
      allowedMentions: { users: members.slice(0, 10).map((m) => m.id), roles: [] },
    });

    return true;
  }

  return false;
}
