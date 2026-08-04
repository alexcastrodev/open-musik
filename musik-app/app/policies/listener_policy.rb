class ListenerPolicy < ApplicationPolicy
  def index? = user&.admin?
end
