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
};

export async function handleDashboardCommand(
  interaction: Interaction,
  _deps: DashboardDeps,
): Promise<boolean> {
  if (!interaction.isChatInputCommand()) return false;
  if (interaction.commandName !== "nudl") return false;

  const rows = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("dash:user")
        .setLabel("My Addresses")
        .setStyle(ButtonStyle.Primary),
    ),
  ];

  await interaction.reply({
    content:
      "**nudl**\n\n" +
      "UI-first dashboard.\n" +
      "Admins: use `/nudl-admin`.\n",
    components: rows,
    flags: MessageFlags.Ephemeral,
  });

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
        .setCustomId("dash:admin")
        .setLabel("Backoffice")
        .setStyle(ButtonStyle.Primary),
    ),
  ];

  await interaction.reply({
    content:
      "**nudl admin**\n\n" +
      "Admin dashboard (WIP): manage tokens/safes, payouts, donation opt-in, and missing-address announcements.",
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

  if (interaction.customId === "dash:user") {
    const rows = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("dash:user:view")
          .setLabel("View my addresses")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("dash:user:add")
          .setLabel("Add / update address")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("dash:user:remove")
          .setLabel("Remove address")
          .setStyle(ButtonStyle.Danger),
      ),
    ];

    await (interaction as ButtonInteraction).update({
      content:
        "**My Addresses**\n\n" +
        "- View your saved addresses\n" +
        "- Add/update an address via guided UI\n",
      components: rows,
    });
    return true;
  }

  if (interaction.customId === "dash:user:view") {
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;

    const addresses = await deps.userModel.getUser(userId, guildId);
    if (!addresses.length) {
      await (interaction as ButtonInteraction).reply({
        content: "No addresses set yet.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    // nicer formatting
    const lines = addresses
      .map(({ chainId, address }) => {
        const chainName = ChainsById[chainId]?.name ?? String(chainId);
        return `• **${chainName}** (${chainId}) — \`${address}\``;
      })
      .join("\n");

    await (interaction as ButtonInteraction).reply({
      content: `**Your addresses**\n\n${lines}`,
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  if (interaction.customId === "dash:user:remove") {
    const networkRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("dash:user:remove:network")
        .setPlaceholder("Select a network to remove...")
        .addOptions(
          Chains.map((c) => ({
            label: c.name,
            value: String(c.chainId),
            description: c.shortName ? `(${c.shortName})` : undefined,
          })),
        ),
    );

    await (interaction as ButtonInteraction).reply({
      content: "Pick a network to remove:",
      components: [networkRow],
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  if (interaction.customId === "dash:user:add") {
    // Select a network first (UI replacement for slash command options)
    const networkRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("dash:user:add:network")
        .setPlaceholder("Select a network...")
        .addOptions(
          Chains.map((c) => ({
            label: c.name,
            value: String(c.chainId),
            description: c.shortName ? `(${c.shortName})` : undefined,
          })),
        ),
    );

    await (interaction as ButtonInteraction).reply({
      content: "Pick a network to add/update:",
      components: [networkRow],
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  // confirm removal
  if (interaction.customId.startsWith("dash:user:remove:confirm:")) {
    const chainId = Number(interaction.customId.split(":")[3]);
    assert(chainId, "Invalid chain");

    const guildId = interaction.guildId!;
    const userId = interaction.user.id;

    await deps.userModel.deleteAddress(userId, guildId, chainId);

    const chainName = ChainsById[chainId]?.name ?? String(chainId);

    await (interaction as ButtonInteraction).reply({
      content: `✅ Removed your address for **${chainName}** (${chainId}).`,
      flags: MessageFlags.Ephemeral,
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
      // manual mode should not hit prefill normally, but be defensive
      members = Array.from(guild.members.cache.values()).filter((m) => !m.user.bot);
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

    const prefill = members.map((m) => `${m.id},0`).join("\n");
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

  if (interaction.customId === "dash:user:add:network") {
    const chainId = Number(interaction.values[0]);
    assert(chainId, "Invalid chain");

    const chainName = ChainsById[chainId]?.name ?? String(chainId);

    // Reuse existing modal submit handling by using the legacy customId: addAddress_<chainId>
    const modal = new ModalBuilder()
      .setCustomId(`addAddress_${chainId}`)
      .setTitle(`Add Address for ${chainName} (${chainId})`);

    const input = new TextInputBuilder()
      .setCustomId("addressInput")
      .setLabel("Enter your address")
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

    const chainName = ChainsById[chainId]?.name ?? String(chainId);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`dash:user:remove:confirm:${chainId}`)
        .setLabel(`Remove ${chainName}`)
        .setStyle(ButtonStyle.Danger),
    );

    await (interaction as StringSelectMenuInteraction).reply({
      content: `Confirm removal for **${chainName}** (${chainId})?`,
      components: [row],
      flags: MessageFlags.Ephemeral,
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
    };

    const chainName = ChainsById[chainId]?.name ?? String(chainId);

    const rows = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`dash:admin:payout:recipients:${payoutId}:manual`)
          .setLabel("Manual paste")
          .setStyle(ButtonStyle.Secondary),
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
