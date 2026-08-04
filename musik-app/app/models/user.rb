# == Schema Information
#
# Table name: users
#
#  id              :bigint           not null, primary key
#  avatar          :string
#  role            :integer          default("member"), not null
#  username        :string           not null
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#  discord_user_id :string           not null
#
# Indexes
#
#  index_users_on_discord_user_id  (discord_user_id) UNIQUE
#
class User < ApplicationRecord
  enum :role, { member: 0, moderator: 1, admin: 2 }

  validates :discord_user_id, presence: true, uniqueness: true
  validates :username, presence: true

  def self.from_discord(auth)
    find_or_initialize_by(discord_user_id: auth.uid).tap do |user|
      user.username = auth.info.name
      user.avatar   = auth.info.image
      user.save!
    end
  end

  def avatar_url
    avatar.presence
  end
end
