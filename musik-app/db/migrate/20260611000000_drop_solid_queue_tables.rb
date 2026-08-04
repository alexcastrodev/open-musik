# Sidekiq substituiu o Solid Queue (estado vive no Redis/Valkey agora), então as
# tabelas solid_queue_* não são mais usadas. O down recria via load do schema do
# Solid Queue, caso seja preciso reverter.
class DropSolidQueueTables < ActiveRecord::Migration[8.1]
  TABLES = %w[
    solid_queue_blocked_executions
    solid_queue_claimed_executions
    solid_queue_failed_executions
    solid_queue_ready_executions
    solid_queue_recurring_executions
    solid_queue_scheduled_executions
    solid_queue_semaphores
    solid_queue_pauses
    solid_queue_recurring_tasks
    solid_queue_processes
    solid_queue_jobs
  ].freeze

  def up
    TABLES.each { |t| drop_table(t, if_exists: true) }
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Reinstale o solid_queue e rode db:prepare para recriar as tabelas."
  end
end
