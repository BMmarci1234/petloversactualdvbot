const { 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder, 
  AttachmentBuilder, 
  PermissionFlagsBits, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle 
} = require('discord.js');
const ms = require('ms');
const path = require('path');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('contest')
    .setDescription('Start a contest countdown.')
    .addStringOption(option =>
      option.setName('time')
        .setDescription('Set the contest duration (e.g., 1d, 1h, 1m)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('competitionmessagelink')
        .setDescription('Send the competition message link!')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const time = interaction.options.getString('time');
    const competitionLink = interaction.options.getString('competitionmessagelink');
    const duration = ms(time);

    if (!duration) {
      return interaction.reply({ content: 'Invalid time format. Please use a valid format (e.g., 1d, 1h, 1m).', ephemeral: true });
    }

    const contestEndTimestamp = Math.floor(Date.now() / 1000) + Math.floor(duration / 1000);
    const logoPath = path.join(__dirname, '../petloverslogo.png');
    const logoAttachment = new AttachmentBuilder(logoPath);

    // Embed setup
    const embed = new EmbedBuilder()
      .setColor(0x1E90FF)
      .setTitle('🕒 Contest Countdown')
      .setDescription(`This contest has been started [here](${competitionLink}). To attend, please press the attend button and link us your GitHub repository there.`)
      .addFields(
        { name: 'End Time', value: `<t:${contestEndTimestamp}:F>` },
        { name: 'Status', value: 'Ongoing', inline: true },
        { name: 'Participants', value: '0', inline: true } // Default participants count
      )
      .setFooter({ text: 'Pet Lovers Development Team', iconURL: 'attachment://petloverslogo.png' })
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('attend')
          .setLabel('Attend')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('unattend')
          .setLabel('Withdraw')
          .setStyle(ButtonStyle.Danger)
      );

    const contestChannel = interaction.client.channels.cache.get(config.contestChannelId);
    const message = await contestChannel.send({ embeds: [embed], components: [row], files: [logoAttachment] });

    let participants = new Set();

    const filter = i => ['attend', 'unattend'].includes(i.customId);
    const collector = message.createMessageComponentCollector({ filter, time: duration });

    collector.on('collect', async i => {
      if (i.customId === 'attend') {
        // Create a unique nonce for this interaction
        const nonce = i.id; // Use the interaction ID as the nonce

        const modal = new ModalBuilder()
          .setCustomId(`github_modal_${nonce}`) // Attach the nonce to the custom ID
          .setTitle('GitHub Repository Submission');

        const githubInput = new TextInputBuilder()
          .setCustomId('githubLink')
          .setLabel("Enter your GitHub repository link:")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(githubInput);
        modal.addComponents(actionRow);

        // Show the modal immediately without deferring the interaction
        await i.showModal(modal);

        try {
          // Await the modal submission and check if it's for the same interaction using the nonce
          const submittedModal = await i.awaitModalSubmit({ 
            time: duration, 
            filter: (modalInteraction) => modalInteraction.customId === `github_modal_${nonce}` 
          });

          const githubLink = submittedModal.fields.getTextInputValue('githubLink');

          // Add the participant
          participants.add(i.user.id);

          // Update participants count in the embed
          const updatedEmbed = EmbedBuilder.from(embed)
            .setFields(
              { name: 'End Time', value: `<t:${contestEndTimestamp}:F>` },
              { name: 'Status', value: 'Ongoing', inline: true },
              { name: 'Participants', value: `${participants.size}`, inline: true } // Update participants count
            );

          await message.edit({ embeds: [updatedEmbed] });
          await submittedModal.reply({ content: 'Thank you for submitting your GitHub link! You are now participating.', ephemeral: true });

          // Send a message to the contest or results channel with the GitHub link
          const resultChannel = interaction.client.channels.cache.get(config.resultChannelId);
          if (resultChannel) {
            const participationEmbed = new EmbedBuilder()
              .setColor(0x00FF00)
              .setTitle('✅ New Participant')
              .setDescription(`${i.user} has joined the contest with their GitHub repository link: ${githubLink}`)
              .setTimestamp();

            await resultChannel.send({ embeds: [participationEmbed] });
          }

        } catch (err) {
          console.error('Error handling modal submission:', err);
          i.followUp({ content: 'Something went wrong while handling your submission.', ephemeral: true });
        }

      } else if (i.customId === 'unattend') {
        if (!participants.has(i.user.id)) {
          return i.reply({ content: 'You are not currently attending.', ephemeral: true });
        }

        participants.delete(i.user.id);

        // Update participants count in the embed
        const updatedEmbed = EmbedBuilder.from(embed)
          .setFields(
            { name: 'End Time', value: `<t:${contestEndTimestamp}:F>` },
            { name: 'Status', value: 'Ongoing', inline: true },
            { name: 'Participants', value: `${participants.size}`, inline: true } // Update participants count
          );

        await message.edit({ embeds: [updatedEmbed] });
        await i.reply({ content: 'You have withdrawn from the contest.', ephemeral: true });

        // Notify results channel about withdrawal
        const resultChannel = interaction.client.channels.cache.get(config.resultChannelId);
        if (resultChannel) {
          const withdrawalEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Withdrawal Notification')
            .setDescription(`${i.user} has withdrawn from the contest.`)
            .setTimestamp();

          await resultChannel.send({ embeds: [withdrawalEmbed] });
        }
      }
    });

    collector.on('end', async () => {
      const endedEmbed = EmbedBuilder.from(embed)
        .setFields(
          { name: 'End Time', value: `<t:${contestEndTimestamp}:F>` },
          { name: 'Status', value: 'Ended', inline: true },
          { name: 'Participants', value: `${participants.size}`, inline: true }
        )
        .setColor(0xFF0000);

      const endedEmbedMessage = new EmbedBuilder()
        .setTitle("Competition Ended!")
        .setDescription(`[This competition](${competitionLink}) has come to an end! I wish everyone the best who attended! ${participants.size} participants have attended this contest.`)
        .setColor(0xFF0000);

      await message.edit({ embeds: [endedEmbed], components: [] });
      contestChannel.send({ embeds: [endedEmbedMessage] });
    });

    await interaction.reply({ content: 'Contest started!', ephemeral: true });
  }
};
