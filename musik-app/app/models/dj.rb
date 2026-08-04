# DJ de um servidor (Épico 3). Ver Api::DjsController. O "modo DJ" está ativo
# quando o guild tem ≥1 DJ; aí só DJs (ou admin do servidor) controlam a
# reprodução/fila. Sem DJs, modo aberto (todo mundo controla).
# == Schema Information
#
# Table name: djs
#
#  id               :bigint           not null, primary key
#  added_by         :string
#  username         :string
#  created_at       :datetime         not null
#  updated_at       :datetime         not null
#  discord_guild_id :string           not null
#  discord_user_id  :string           not null
#
# Indexes
#
#  index_djs_on_discord_guild_id_and_discord_user_id  (discord_guild_id,discord_user_id) UNIQUE
#
class Dj < ApplicationRecord
  validates :discord_guild_id, :discord_user_id, presence: true
  validates :discord_user_id, uniqueness: { scope: :discord_guild_id }

  scope :for_guild, ->(gid) { where(discord_guild_id: gid.to_s) }

  # O guild está em "modo DJ" (tem ao menos um DJ)?
  def self.restricted?(guild_id)
    for_guild(guild_id).exists?
  end

  # O usuário é DJ neste guild?
  def self.dj?(guild_id, user_id)
    for_guild(guild_id).exists?(discord_user_id: user_id.to_s)
  end
end
