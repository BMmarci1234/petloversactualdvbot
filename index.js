const { Client, GatewayIntentBits, Collection, Partials, InteractionType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel]
});

client.commands = new Collection();

// Load command files
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Set up commands in the Collection
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Register commands directly to a specific guild
  const guild = client.guilds.cache.get(config.guildId);
  if (guild) {
    await guild.commands.set(client.commands.map(cmd => cmd.data));
    console.log('Slash commands registered.');
  } else {
    console.error('Guild not found.');
  }
});

// Interaction handling for commands and buttons
client.on('interactionCreate', async interaction => {
  if (interaction.isCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      // Only reply if the interaction hasn't already been replied to or deferred
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'There was an error executing this command.', ephemeral: true });
      }
    }
  }

  // Handle modal submissions
  if (interaction.type === InteractionType.ModalSubmit) {
    try {
      if (interaction.customId === 'github_modal') {
        const githubLink = interaction.fields.getTextInputValue('githubLink');

        const embed = new EmbedBuilder()
          .setColor(0x00FF00)
          .setTitle('GitHub Submission')
          .setDescription(`${interaction.user} submitted the following GitHub repository:`)
          .addFields({ name: 'Repository Link', value: githubLink })
          .setTimestamp();

        const resultChannel = interaction.client.channels.cache.get(config.resultChannelId);
        await resultChannel.send({ embeds: [embed] });

        // Confirm submission in response
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'Your submission has been received!', ephemeral: true });
        }
      }
    } catch (error) {
      console.error("Error handling modal submission:", error);
    }
  }
});

// Login to Discord
client.login(config.token);
