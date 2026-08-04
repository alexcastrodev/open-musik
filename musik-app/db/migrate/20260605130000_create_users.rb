class CreateUsers < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      t.string  :username,        null: false
      t.string  :discord_user_id, null: false
      t.string  :avatar
      t.integer :role,            null: false, default: 0

      t.timestamps
    end

    add_index :users, :discord_user_id, unique: true
  end
end
