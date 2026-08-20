import amqp, { type Channel, type ChannelModel, type ConfirmChannel } from 'amqplib';

export type AmqpConnection = ChannelModel;

export async function connectAmqp(url: string): Promise<AmqpConnection> {
  return amqp.connect(url);
}

export async function createConfirmChannel(connection: AmqpConnection): Promise<ConfirmChannel> {
  return connection.createConfirmChannel();
}

export async function createChannel(connection: AmqpConnection): Promise<Channel> {
  return connection.createChannel();
}

export async function closeAmqp(connection: AmqpConnection): Promise<void> {
  await connection.close();
}
